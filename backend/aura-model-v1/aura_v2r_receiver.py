import re
import json
import argparse
import difflib

import torch
import torch.nn as nn
import torchaudio

# ============================================================
# AURA V2-R RECEIVER
#
# FINAL LENGTH-HEADER + POST-PROCESSING VERSION
# - Do NOT peak-normalize stego input
# - Keeps same decode logic
# - Adds 2-byte length-header support
# - Decodes header first, then exact payload only
# - Ignores extra tail audio after payload
# - Adds deterministic post-processing correction
# - Prints:
#     1) Header info
#     2) Raw decoded text
#     3) Corrected text
#     4) Changed words
# ============================================================

# ------------------------------------------------------------
# LENGTH HEADER SETTINGS
# 2 bytes => 4 nibbles => repeat-3 => 12 chunks
# ------------------------------------------------------------
HEADER_BYTES = 2
HEADER_NIBBLES = HEADER_BYTES * 2  # 4


# ============================================================
# MODEL
# ============================================================

class AuraV2RDecoder(nn.Module):
    def __init__(self, out_bits=4, base_ch=32):
        super().__init__()

        self.net = nn.Sequential(
            nn.Conv2d(1, base_ch, kernel_size=3, padding=1),
            nn.BatchNorm2d(base_ch),
            nn.ReLU(inplace=True),

            nn.Conv2d(base_ch, base_ch, kernel_size=3, padding=1),
            nn.BatchNorm2d(base_ch),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),

            nn.Conv2d(base_ch, base_ch * 2, kernel_size=3, padding=1),
            nn.BatchNorm2d(base_ch * 2),
            nn.ReLU(inplace=True),

            nn.Conv2d(base_ch * 2, base_ch * 2, kernel_size=3, padding=1),
            nn.BatchNorm2d(base_ch * 2),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),

            nn.Conv2d(base_ch * 2, base_ch * 4, kernel_size=3, padding=1),
            nn.BatchNorm2d(base_ch * 4),
            nn.ReLU(inplace=True),

            nn.AdaptiveAvgPool2d((1, 1))
        )

        self.head = nn.Sequential(
            nn.Flatten(),
            nn.Linear(base_ch * 4, base_ch * 4),
            nn.ReLU(inplace=True),
            nn.Linear(base_ch * 4, out_bits)
        )

    def forward(self, spec_2d):
        z = self.net(spec_2d)
        logits = self.head(z)
        return logits


# ============================================================
# CONFIG / CORE HELPERS
# ============================================================

def load_cfg(config_path):
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)


def bits4_to_nibble(bits4):
    bits4 = [int(b) & 1 for b in bits4]
    return (bits4[0] << 3) | (bits4[1] << 2) | (bits4[2] << 1) | bits4[3]


def nibble_to_bits4(n):
    n = int(n) & 0x0F
    return [(n >> 3) & 1, (n >> 2) & 1, (n >> 1) & 1, n & 1]


def nibbles_to_byte(hi, lo):
    return ((int(hi) & 0x0F) << 4) | (int(lo) & 0x0F)


def byte_to_char(byte_val):
    return chr(int(byte_val) & 0xFF)


def nibble_sequence_to_text(nibbles):
    assert len(nibbles) % 2 == 0
    chars = []
    for i in range(0, len(nibbles), 2):
        hi = nibbles[i]
        lo = nibbles[i + 1]
        chars.append(byte_to_char(nibbles_to_byte(hi, lo)))
    return ''.join(chars)


# ============================================================
# LENGTH HEADER HELPERS
# ============================================================

def get_header_chunk_count(repeat_factor):
    return HEADER_NIBBLES * repeat_factor


def header_nibbles_to_length(header_nibbles):
    """
    header_nibbles = [b0_hi, b0_lo, b1_hi, b1_lo]
    big-endian 2-byte unsigned int
    """
    if len(header_nibbles) != 4:
        raise ValueError(f"Expected 4 header nibbles, got {len(header_nibbles)}")

    b0 = nibbles_to_byte(header_nibbles[0], header_nibbles[1])
    b1 = nibbles_to_byte(header_nibbles[2], header_nibbles[3])

    msg_len = ((b0 & 0xFF) << 8) | (b1 & 0xFF)
    return msg_len


def get_payload_chunk_count_for_chars(msg_len, cfg):
    return msg_len * cfg["chunks_per_char_protected"]


# ============================================================
# AUDIO / STFT
# ============================================================

def load_audio_mono_16k_for_decode(path, target_sr=16000):
    """
    IMPORTANT:
    For decoding stego audio, DO NOT peak-normalize.
    """
    wav, sr = torchaudio.load(path)
    if wav.size(0) > 1:
        wav = wav.mean(dim=0, keepdim=True)
    if sr != target_sr:
        wav = torchaudio.functional.resample(wav, sr, target_sr)
        sr = target_sr
    return wav.float(), sr


def chunk_audio_tensor(wav, chunk_len):
    T = wav.size(1)
    usable = (T // chunk_len) * chunk_len
    wav = wav[:, :usable]
    if usable == 0:
        return torch.empty(0, 1, chunk_len)
    chunks = wav.view(1, usable // chunk_len, chunk_len).squeeze(0)
    return chunks.unsqueeze(1)


def stft_complex_batch(wav_batch, cfg):
    x = wav_batch.squeeze(1)
    win = torch.hann_window(cfg["win_length"], device=x.device)
    X = torch.stft(
        x,
        n_fft=cfg["n_fft"],
        hop_length=cfg["hop_length"],
        win_length=cfg["win_length"],
        window=win,
        return_complex=True,
        center=True,
        normalized=False
    )
    return X


def complex_to_logmag_phase(X):
    mag = torch.abs(X)
    phase = torch.angle(X)
    logmag = torch.log1p(mag)
    return logmag, phase


# ============================================================
# DECODING
# ============================================================

@torch.no_grad()
def logits_to_bits4(logits):
    return (torch.sigmoid(logits) >= 0.5).long()


@torch.no_grad()
def decode_single_chunk_to_nibble(decoder, stego_chunk_wav, cfg, device):
    X = stft_complex_batch(stego_chunk_wav.to(device), cfg)
    logmag, _ = complex_to_logmag_phase(X)
    inp = logmag.unsqueeze(1)
    logits = decoder(inp)
    bits = logits_to_bits4(logits)[0].cpu().tolist()
    return bits4_to_nibble(bits)


def majority_vote_nibble_triplet(n0, n1, n2):
    b0 = nibble_to_bits4(n0)
    b1 = nibble_to_bits4(n1)
    b2 = nibble_to_bits4(n2)

    voted = []
    for i in range(4):
        s = b0[i] + b1[i] + b2[i]
        voted.append(1 if s >= 2 else 0)
    return bits4_to_nibble(voted)


def majority_vote_repeated_nibbles(pred_nibbles, repeat_factor=3):
    assert len(pred_nibbles) % repeat_factor == 0
    out = []
    for i in range(0, len(pred_nibbles), repeat_factor):
        group = pred_nibbles[i:i + repeat_factor]

        if repeat_factor == 3:
            out.append(majority_vote_nibble_triplet(group[0], group[1], group[2]))
        else:
            bit_lists = [nibble_to_bits4(n) for n in group]
            voted_bits = []
            for b in range(4):
                s = sum(x[b] for x in bit_lists)
                voted_bits.append(1 if s >= (repeat_factor // 2 + 1) else 0)
            out.append(bits4_to_nibble(voted_bits))
    return out


@torch.no_grad()
def decode_nibbles_from_chunk_block(decoder, chunk_block, cfg, device):
    """
    Decode a block of chunks into:
      pred_chunk_nibbles, voted_nibbles
    """
    pred_chunk_nibbles = []

    for i in range(chunk_block.size(0)):
        pred_n = decode_single_chunk_to_nibble(decoder, chunk_block[i:i + 1], cfg, device)
        pred_chunk_nibbles.append(pred_n)

    voted_nibbles = majority_vote_repeated_nibbles(
        pred_chunk_nibbles,
        repeat_factor=cfg["repeat_factor"]
    )

    return pred_chunk_nibbles, voted_nibbles


# ============================================================
# AURA POST-PROCESSING
# ============================================================

# Small built-in vocabulary for common natural demo words.
# You can expand this anytime.
AURA_COMMON_WORDS = {
    "a", "an", "and", "are", "at", "be", "behind", "bring", "by", "call",
    "come", "door", "for", "from", "go", "hello", "help", "here", "hide",
    "home", "i", "if", "in", "is", "it", "mall", "me", "meet", "near",
    "now", "of", "on", "outside", "park", "please", "safe", "secret",
    "see", "send", "the", "there", "to", "tomorrow", "tonight", "wait",
    "water", "we", "where", "you", "your",
    "radio", "fountain"
}


def is_alpha_word(token):
    return token.isalpha()


def has_suspicious_chars(token):
    """
    Detect tokens with characters that often appear due to Aura bit-flip artifacts.
    """
    suspicious = set("`~_^|\\/[]{}<>")
    return any(ch in suspicious for ch in token)


def mostly_letters(token):
    if not token:
        return False
    letters = sum(ch.isalpha() for ch in token)
    return letters >= max(1, len(token) - 2)


def same_length_letter_score(candidate, raw_token):
    """
    Score how well a candidate matches raw token while allowing weird chars in raw token.
    """
    if len(candidate) != len(raw_token):
        return -999

    score = 0
    for c, r in zip(candidate.lower(), raw_token.lower()):
        if r.isalpha():
            if c == r:
                score += 2
            else:
                score -= 1
        else:
            # suspicious/non-letter in raw: candidate letter is plausible
            score += 1
    return score


def best_dictionary_match(token, vocabulary):
    """
    Strong preference for:
    - same length
    - close lexical shape
    - high letter overlap
    """
    if not token:
        return None

    lower = token.lower()

    # Exact known word => keep
    if lower in vocabulary:
        return token

    # Prefer same-length candidates
    same_len = [w for w in vocabulary if len(w) == len(token)]

    # Score same-length candidates first
    if same_len:
        scored = []
        for w in same_len:
            ratio = difflib.SequenceMatcher(None, lower, w).ratio()
            score = same_length_letter_score(w, token) + ratio
            scored.append((score, w))
        scored.sort(reverse=True)

        best_score, best_word = scored[0]

        # conservative threshold
        if best_score >= 2.5:
            return best_word

    # Fallback to difflib close match
    matches = difflib.get_close_matches(lower, list(vocabulary), n=1, cutoff=0.6)
    if matches:
        return matches[0]

    return None


def split_preserve_whitespace(text):
    """
    Split into tokens while preserving spaces exactly.
    """
    return re.findall(r'\S+|\s+', text)


def correct_one_token(token, vocabulary):
    """
    Only correct suspicious tokens, not normal clean words.
    """
    if token.isspace():
        return token, False

    # Keep pure punctuation untouched
    if not any(ch.isalnum() for ch in token):
        return token, False

    # If already alphabetic and looks normal, keep
    if is_alpha_word(token):
        return token, False

    # Only try correcting if it looks like a mostly-letter corrupted word
    if not mostly_letters(token):
        return token, False

    if not has_suspicious_chars(token):
        # If mixed but not suspicious, stay conservative
        return token, False

    suggestion = best_dictionary_match(token, vocabulary)
    if suggestion is None:
        return token, False

    # Preserve capitalization style
    if token[:1].isupper():
        suggestion = suggestion.capitalize()

    if suggestion.lower() == token.lower():
        return token, False

    return suggestion, True


def postprocess_aura_text(raw_text):
    """
    Returns:
      corrected_text, changes(list)
    """
    pieces = split_preserve_whitespace(raw_text)
    corrected = []
    changes = []

    for piece in pieces:
        new_piece, changed = correct_one_token(piece, AURA_COMMON_WORDS)
        corrected.append(new_piece)

        if changed:
            changes.append({
                "from": piece,
                "to": new_piece
            })

    corrected_text = "".join(corrected)
    return corrected_text, changes


# ============================================================
# MAIN
# ============================================================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--weights", required=True)
    parser.add_argument("--stego", required=True)
    args = parser.parse_args()

    cfg = load_cfg(args.config)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    decoder = AuraV2RDecoder(
        out_bits=cfg["logical_bits_per_chunk"],
        base_ch=32
    ).to(device)

    ckpt = torch.load(args.weights, map_location=device)
    decoder.load_state_dict(ckpt["decoder_state_dict"])
    decoder.eval()

    wav, _ = load_audio_mono_16k_for_decode(args.stego, target_sr=cfg["sample_rate"])
    chunks = chunk_audio_tensor(wav, cfg["chunk_samples"])

    if chunks.size(0) == 0:
        raise RuntimeError("Stego file is too short or empty after chunking.")

    total_chunks = chunks.size(0)
    header_chunks = get_header_chunk_count(cfg["repeat_factor"])

    if total_chunks < header_chunks:
        raise RuntimeError(
            f"Stego file too short for header decode. "
            f"Need at least {header_chunks} chunks, got {total_chunks}."
        )

    # --------------------------------------------------------
    # 1) Decode header first
    # --------------------------------------------------------
    header_block = chunks[:header_chunks]
    header_pred_chunk_nibbles, header_voted_nibbles = decode_nibbles_from_chunk_block(
        decoder, header_block, cfg, device
    )

    if len(header_voted_nibbles) != HEADER_NIBBLES:
        raise RuntimeError(
            f"Header decode produced {len(header_voted_nibbles)} nibbles, expected {HEADER_NIBBLES}."
        )

    msg_len = header_nibbles_to_length(header_voted_nibbles)

    # --------------------------------------------------------
    # 2) Compute exact payload size from header
    # --------------------------------------------------------
    payload_chunks_needed = get_payload_chunk_count_for_chars(msg_len, cfg)
    total_needed_chunks = header_chunks + payload_chunks_needed

    if total_chunks < total_needed_chunks:
        raise RuntimeError(
            f"Stego file shorter than declared payload length.\n"
            f"Header says msg_len={msg_len} chars => need {total_needed_chunks} total chunks\n"
            f"But file only has {total_chunks} chunks."
        )

    # --------------------------------------------------------
    # 3) Decode only the exact payload block
    # --------------------------------------------------------
    payload_block = chunks[header_chunks:header_chunks + payload_chunks_needed]
    payload_pred_chunk_nibbles, payload_voted_nibbles = decode_nibbles_from_chunk_block(
        decoder, payload_block, cfg, device
    )

    # payload_voted_nibbles should be 2 * msg_len
    expected_payload_nibbles = msg_len * 2
    if len(payload_voted_nibbles) != expected_payload_nibbles:
        raise RuntimeError(
            f"Payload decode produced {len(payload_voted_nibbles)} nibbles, "
            f"expected {expected_payload_nibbles}."
        )

    raw_text = nibble_sequence_to_text(payload_voted_nibbles)
    corrected_text, changes = postprocess_aura_text(raw_text)

    extra_tail_chunks = total_chunks - total_needed_chunks

    print("=" * 80)
    print("AURA V2-R RECEIVER (LENGTH-HEADER MODE)")
    print("=" * 80)
    print("Stego file            :", args.stego)
    print("Total chunks in file  :", total_chunks)
    print("Header chunks         :", header_chunks)
    print("Header voted nibbles  :", len(header_voted_nibbles))
    print("Decoded msg length    :", msg_len, "chars")
    print("Payload chunks needed :", payload_chunks_needed)
    print("Total needed chunks   :", total_needed_chunks)
    print("Ignored tail chunks   :", extra_tail_chunks)
    print("-" * 80)

    print("RAW DECODED TEXT:")
    print(raw_text)
    print("-" * 80)

    print("CORRECTED TEXT:")
    print(corrected_text)
    print("-" * 80)

    if changes:
        print("CHANGED WORDS:")
        for c in changes:
            print(f"{c['from']}  ->  {c['to']}")
    else:
        print("CHANGED WORDS:")
        print("None")

    print("-" * 80)
    print("Header first 12 chunk nibbles :", header_pred_chunk_nibbles[:12])
    print("Payload first 24 chunk nibbles:", payload_pred_chunk_nibbles[:24])
    print("=" * 80)


if __name__ == "__main__":
    main()