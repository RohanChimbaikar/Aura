import re
import json
import argparse
import difflib
import struct
import time

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
# COMPACT HEADER SETTINGS
# 24 bytes => 48 nibbles
# ------------------------------------------------------------
HEADER_BYTES = 24
HEADER_NIBBLES = 48


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
# PROTOCOL, ECC, & ALIGNMENT HELPERS
# ============================================================

def crc16(data: bytes) -> int:
    crc = 0xFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    return crc & 0xFFFF


def hamming_8_4_decode_nibble(hi, lo):
    b = ((hi & 0x0F) << 4) | (lo & 0x0F)
    r = [
        (b >> 7) & 1,  # r1 (p1)
        (b >> 6) & 1,  # r2 (p2)
        (b >> 5) & 1,  # r3 (d1)
        (b >> 4) & 1,  # r4 (p3)
        (b >> 3) & 1,  # r5 (d2)
        (b >> 2) & 1,  # r6 (d3)
        (b >> 1) & 1,  # r7 (d4)
        b & 1          # r8 (p4)
    ]
    
    s1 = r[0] ^ r[2] ^ r[4] ^ r[6]
    s2 = r[1] ^ r[2] ^ r[5] ^ r[6]
    s3 = r[3] ^ r[4] ^ r[5] ^ r[6]
    
    syndrome = (s3 << 2) | (s2 << 1) | s1
    overall_parity = r[0] ^ r[1] ^ r[2] ^ r[3] ^ r[4] ^ r[5] ^ r[6] ^ r[7]
    
    corrected = 0
    uncorrectable = False
    
    if syndrome == 0 and overall_parity == 0:
        pass
    elif syndrome != 0 and overall_parity == 1:
        error_pos = syndrome - 1
        r[error_pos] ^= 1
        corrected = 1
    elif syndrome == 0 and overall_parity == 1:
        corrected = 1
    else:
        uncorrectable = True
        
    d1, d2, d3, d4 = r[2], r[4], r[5], r[6]
    decoded_nibble = d1 | (d2 << 1) | (d3 << 2) | (d4 << 3)
    return decoded_nibble, uncorrectable, corrected


def decode_payload_ecc(voted_nibbles, ecc_scheme):
    payload_bytes = bytearray()
    uncorrectable_count = 0
    corrected_bits = 0
    
    if ecc_scheme == 1:
        num_chars = len(voted_nibbles) // 4
        for i in range(num_chars):
            hi_hi = voted_nibbles[i * 4]
            hi_lo = voted_nibbles[i * 4 + 1]
            lo_hi = voted_nibbles[i * 4 + 2]
            lo_lo = voted_nibbles[i * 4 + 3]
            
            decoded_hi, unc_hi, corr_hi = hamming_8_4_decode_nibble(hi_hi, hi_lo)
            decoded_lo, unc_lo, corr_lo = hamming_8_4_decode_nibble(lo_hi, lo_lo)
            
            if unc_hi or unc_lo:
                uncorrectable_count += 1
            corrected_bits += corr_hi + corr_lo
            
            char_byte = ((decoded_hi & 0x0F) << 4) | (decoded_lo & 0x0F)
            payload_bytes.append(char_byte)
    else:
        num_chars = len(voted_nibbles) // 2
        for i in range(num_chars):
            hi = voted_nibbles[i * 2]
            lo = voted_nibbles[i * 2 + 1]
            char_byte = ((hi & 0x0F) << 4) | (lo & 0x0F)
            payload_bytes.append(char_byte)
            
    return bytes(payload_bytes), uncorrectable_count, corrected_bits


def _unpack_header_bytes(header_bytes):
    magic, version, tx_id, part_index, total_parts, payload_len, crc_payload, chunk_count, ecc_scheme, codec_hint, timestamp = struct.unpack(
        ">4sB I B B H H H B B I",
        header_bytes[:23]
    )
    if magic != b"AURA":
        raise ValueError(f"Magic header mismatch: expected AURA, got {magic}")
    return {
        "tx_id": tx_id,
        "part_index": part_index,
        "total_parts": total_parts,
        "payload_len": payload_len,
        "crc_payload": crc_payload,
        "chunk_count": chunk_count,
        "ecc_scheme": ecc_scheme,
        "codec_hint": codec_hint,
        "timestamp": timestamp,
        "checksum_ok": True
    }


def unpack_header(header_voted_nibbles):
    if len(header_voted_nibbles) != 48:
        raise ValueError(f"Expected 48 header nibbles, got {len(header_voted_nibbles)}")
        
    header_bytes = bytearray()
    for i in range(0, 48, 2):
        hi = header_voted_nibbles[i]
        lo = header_voted_nibbles[i+1]
        header_bytes.append(((hi & 0x0F) << 4) | (lo & 0x0F))
        
    header_bytes = bytes(header_bytes)
    
    # 1. Try direct unpack
    header_checksum_received = header_bytes[23]
    header_checksum_calculated = sum(header_bytes[:23]) % 256
    if header_checksum_received == header_checksum_calculated:
        try:
            return _unpack_header_bytes(header_bytes)
        except ValueError:
            pass
            
    # 2. Try single-bit flip correction across all 24 bytes (192 bits)
    candidates = []
    for bit_idx in range(192):
        byte_idx = bit_idx // 8
        bit_pos = bit_idx % 8
        
        candidate_bytes = bytearray(header_bytes)
        candidate_bytes[byte_idx] ^= (1 << bit_pos)
        candidate_bytes = bytes(candidate_bytes)
        
        chk_rec = candidate_bytes[23]
        chk_calc = sum(candidate_bytes[:23]) % 256
        if chk_rec == chk_calc:
            try:
                info = _unpack_header_bytes(candidate_bytes)
                candidates.append((candidate_bytes, info, byte_idx, bit_pos))
            except ValueError:
                pass
                
    if len(candidates) >= 1:
        corrected_bytes, info, corr_byte, corr_bit = candidates[0]
        print(f"[header] Warning: corrected single-bit flip in header at byte {corr_byte}, bit {corr_bit}!")
        return info
        
    raise ValueError(f"Header checksum mismatch: calculated {header_checksum_calculated}, received {header_checksum_received}")


def find_alignment(decoder, wav, cfg, device):
    sync_pattern = [10, 10, 4, 1, 5, 5, 5, 2, 4, 1, 10, 10]
    best_offset = 0
    best_shift = 0
    min_ber = 1.0
    best_pred_nibbles = []

    chunk_samples = cfg["chunk_samples"]
    step = chunk_samples // 20  # 1600 samples = 0.1s
    
    # We will decode up to 14 chunks starting at each offset
    max_test_chunks = 14
    
    for offset in range(0, chunk_samples, step):
        if wav.size(1) - offset < max_test_chunks * chunk_samples:
            num_test_chunks = (wav.size(1) - offset) // chunk_samples
            if num_test_chunks < 8:
                continue
        else:
            num_test_chunks = max_test_chunks
            
        test_wav = wav[:, offset:offset + num_test_chunks * chunk_samples]
        test_chunks = chunk_audio_tensor(test_wav, chunk_samples)
        
        pred_nibbles = []
        for i in range(test_chunks.size(0)):
            n = decode_single_chunk_to_nibble(decoder, test_chunks[i:i+1], cfg, device)
            pred_nibbles.append(n)
            
        for shift in [-2, -1, 0, 1, 2]:
            total_bits = 0
            bit_errors = 0
            for i in range(len(pred_nibbles)):
                orig_idx = i + shift
                if 0 <= orig_idx < 12:
                    p_bits = nibble_to_bits4(pred_nibbles[i])
                    e_bits = nibble_to_bits4(sync_pattern[orig_idx])
                    bit_errors += sum(p ^ e for p, e in zip(p_bits, e_bits))
                    total_bits += 4
            if total_bits > 0:
                ber = bit_errors / total_bits
                if ber < min_ber:
                    min_ber = ber
                    best_offset = offset
                    best_shift = shift
                    best_pred_nibbles = pred_nibbles
                    
        if min_ber == 0.0:
            break
            
    return best_offset, best_shift, min_ber


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
    
    # Run time-domain alignment search
    best_offset, best_shift, min_ber = find_alignment(decoder, wav, cfg, device)
    
    # Slice wav starting at best_offset
    aligned_wav = wav[:, best_offset:]
    chunks = chunk_audio_tensor(aligned_wav, cfg["chunk_samples"])

    if chunks.size(0) == 0:
        raise RuntimeError("Stego file is too short or empty after chunking.")

    # In our chunks list, the header starts at 12 - best_shift
    header_start = 12 - best_shift
    if header_start < 0:
        raise RuntimeError(f"Sync shift {best_shift} is too large, header starts at negative index {header_start}")
        
    repeat_factor = cfg.get("repeat_factor", 3)
    header_chunks_needed = 48 * repeat_factor
    header_block = chunks[header_start : header_start + header_chunks_needed]
    if header_block.size(0) < header_chunks_needed:
        raise RuntimeError(
            f"Stego file too short to decode header.\n"
            f"Expected {header_chunks_needed} header chunks at start index {header_start}, got {header_block.size(0)}."
        )

    # Decode header chunks
    header_pred_chunk_nibbles = []
    for i in range(header_chunks_needed):
        n = decode_single_chunk_to_nibble(decoder, header_block[i:i+1], cfg, device)
        header_pred_chunk_nibbles.append(n)

    # Majority vote on header nibbles
    header_voted_nibbles = majority_vote_repeated_nibbles(
        header_pred_chunk_nibbles,
        repeat_factor=repeat_factor
    )

    # Unpack the header
    header_info = unpack_header(header_voted_nibbles)

    # Compute exact payload size
    payload_len = header_info["payload_len"]
    if header_info["ecc_scheme"] == 1:
        payload_nibbles_count = payload_len * 4
    else:
        payload_nibbles_count = payload_len * 2
        
    payload_chunks_needed = payload_nibbles_count * repeat_factor
    total_needed_chunks = 12 + header_chunks_needed + payload_chunks_needed + 12

    payload_start = 12 + header_chunks_needed - best_shift
    if payload_start < 0:
        raise RuntimeError(f"Sync shift {best_shift} is too large, payload starts at negative index {payload_start}")
        
    payload_block = chunks[payload_start : payload_start + payload_chunks_needed]
    if payload_block.size(0) < payload_chunks_needed:
        raise RuntimeError(
            f"Stego file shorter than declared payload length.\n"
            f"Header says payload needs {payload_chunks_needed} chunks at start index {payload_start}\n"
            f"But only {payload_block.size(0)} chunks are available."
        )

    # Decode payload block
    payload_pred_chunk_nibbles = []
    for i in range(payload_chunks_needed):
        n = decode_single_chunk_to_nibble(decoder, payload_block[i:i+1], cfg, device)
        payload_pred_chunk_nibbles.append(n)

    # Majority vote
    payload_voted_nibbles = majority_vote_repeated_nibbles(
        payload_pred_chunk_nibbles,
        repeat_factor=repeat_factor
    )

    # ECC decoding
    payload_bytes, uncorrectable_count, corrected_bits = decode_payload_ecc(
        payload_voted_nibbles,
        header_info["ecc_scheme"]
    )

    # Check payload CRC
    calculated_crc = crc16(payload_bytes)
    crc_ok = (calculated_crc == header_info["crc_payload"])

    alignment_offset = (best_offset / cfg["sample_rate"]) - (best_shift * cfg["chunk_seconds"])

    raw_text = payload_bytes.decode("ascii", errors="ignore")
    corrected_text, changes = postprocess_aura_text(raw_text)

    extra_tail_chunks = max(0, chunks.size(0) - (total_needed_chunks - best_shift))

    print("=" * 80)
    print("AURA V2-R RECEIVER (COVERT PACKET ARCHITECTURE)")
    print("=" * 80)
    print("Stego file            :", args.stego)
    print("Total chunks in file  :", chunks.size(0))
    print("Header chunks         :", header_chunks_needed)
    print("Header voted nibbles  :", len(header_voted_nibbles))
    print("Decoded msg length    :", payload_len, "chars")
    print("Payload chunks needed :", payload_chunks_needed)
    print("Total needed chunks   :", total_needed_chunks)
    print("Ignored tail chunks   :", extra_tail_chunks)
    print("Transmission ID       :", header_info["tx_id"])
    print("Part Index            :", header_info["part_index"])
    print("Total Parts           :", header_info["total_parts"])
    print("ECC Scheme            :", header_info["ecc_scheme"])
    print("Codec Hint            :", header_info["codec_hint"])
    print("Payload CRC           :", header_info["crc_payload"])
    print("Payload CRC OK        :", "Pass" if crc_ok else "Fail")
    print("Uncorrectable Count   :", uncorrectable_count)
    print("Corrected Bits        :", corrected_bits)
    print("Sync Lock             :", f"Aligned ({alignment_offset:+.1f}s)")
    print("Sync BER              :", f"{min_ber:.4f}")
    print("Payload Hex           :", payload_bytes.hex())
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