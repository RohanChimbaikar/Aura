import os
import json
import math
import argparse

import torch
import torch.nn as nn
import torch.nn.functional as F
import torchaudio

# ============================================================
# AURA V2-R DEBUG ROUNDTRIP
# Diagnose:
# 1) In-memory decode (before save)
# 2) Save -> reload -> decode
# 3) Compare exact character / nibble / bit failures
# ============================================================


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
# CONFIG / HELPERS
# ============================================================

def load_cfg(config_path):
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)

def safe_ascii_text(text, max_len=None):
    text = ''.join(chr(ord(c) & 0x7F) for c in text)
    if max_len is not None:
        text = text[:max_len]
    return text

def nibble_to_bits4(n):
    n = int(n) & 0x0F
    return [(n >> 3) & 1, (n >> 2) & 1, (n >> 1) & 1, n & 1]

def bits4_to_nibble(bits4):
    bits4 = [int(b) & 1 for b in bits4]
    return (bits4[0] << 3) | (bits4[1] << 2) | (bits4[2] << 1) | bits4[3]

def char_to_byte(ch):
    return ord(ch) & 0xFF

def byte_to_char(byte_val):
    return chr(int(byte_val) & 0xFF)

def byte_to_nibbles(byte_val):
    byte_val = int(byte_val) & 0xFF
    hi = (byte_val >> 4) & 0x0F
    lo = byte_val & 0x0F
    return hi, lo

def nibbles_to_byte(hi, lo):
    return ((int(hi) & 0x0F) << 4) | (int(lo) & 0x0F)

def text_to_nibble_sequence(text):
    text = safe_ascii_text(text)
    nibbles = []
    for ch in text:
        b = char_to_byte(ch)
        hi, lo = byte_to_nibbles(b)
        nibbles.append(hi)
        nibbles.append(lo)
    return nibbles

def nibble_sequence_to_text(nibbles):
    assert len(nibbles) % 2 == 0
    chars = []
    for i in range(0, len(nibbles), 2):
        hi = nibbles[i]
        lo = nibbles[i + 1]
        chars.append(byte_to_char(nibbles_to_byte(hi, lo)))
    return ''.join(chars)

def repeat_nibbles(nibbles, repeat_factor=3):
    out = []
    for n in nibbles:
        out.extend([n] * repeat_factor)
    return out

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


# ============================================================
# AUDIO HELPERS
# ============================================================

def load_audio_mono_16k_cover(path, target_sr=16000):
    """
    Cover loader: same spirit as training/sender path.
    Peak-normalized to 0.95 like original.
    """
    wav, sr = torchaudio.load(path)
    if wav.size(0) > 1:
        wav = wav.mean(dim=0, keepdim=True)
    if sr != target_sr:
        wav = torchaudio.functional.resample(wav, sr, target_sr)

    peak = wav.abs().max().item()
    if peak > 0:
        wav = wav / max(peak, 1e-8) * 0.95

    return wav.float(), target_sr

def load_audio_mono_16k_decode(path, target_sr=16000):
    """
    IMPORTANT:
    For decoding, DO NOT peak-normalize the already-stego signal.
    """
    wav, sr = torchaudio.load(path)
    if wav.size(0) > 1:
        wav = wav.mean(dim=0, keepdim=True)
    if sr != target_sr:
        wav = torchaudio.functional.resample(wav, sr, target_sr)
    return wav.float(), target_sr

def center_crop_or_pad(wav, target_len):
    T = wav.size(1)
    if T == target_len:
        return wav
    if T > target_len:
        start = max(0, (T - target_len) // 2)
        return wav[:, start:start + target_len]
    pad_total = target_len - T
    pad_left = pad_total // 2
    pad_right = pad_total - pad_left
    return F.pad(wav, (pad_left, pad_right))

def build_cover_chunks_for_message(base_wav, total_chunks_needed, chunk_len):
    """
    SAME as sender logic.
    """
    Tfull = base_wav.size(1)
    chunks = []

    if Tfull < chunk_len:
        base_wav = center_crop_or_pad(base_wav, chunk_len)
        Tfull = base_wav.size(1)

    cursor = 0
    for _ in range(total_chunks_needed):
        if cursor + chunk_len <= Tfull:
            ch = base_wav[:, cursor:cursor + chunk_len]
            cursor += chunk_len
        else:
            # same sender fallback
            start = max(0, Tfull - chunk_len)
            ch = base_wav[:, start:start + chunk_len]

        if ch.size(1) != chunk_len:
            ch = center_crop_or_pad(ch, chunk_len)

        chunks.append(ch)

    return torch.stack(chunks, dim=0)  # [N,1,T]

def chunk_audio_tensor(wav, chunk_len):
    """
    SAME as receiver logic.
    """
    T = wav.size(1)
    usable = (T // chunk_len) * chunk_len
    wav = wav[:, :usable]
    if usable == 0:
        return torch.empty(0, 1, chunk_len)
    chunks = wav.view(1, usable // chunk_len, chunk_len).squeeze(0)
    return chunks.unsqueeze(1)  # [N,1,T]


# ============================================================
# STFT / ISTFT
# ============================================================

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

def istft_complex_batch(X, target_len, cfg):
    win = torch.hann_window(cfg["win_length"], device=X.device)
    x = torch.istft(
        X,
        n_fft=cfg["n_fft"],
        hop_length=cfg["hop_length"],
        win_length=cfg["win_length"],
        window=win,
        length=target_len,
        center=True,
        normalized=False
    )
    return x.unsqueeze(1)

def complex_to_logmag_phase(X):
    mag = torch.abs(X)
    phase = torch.angle(X)
    logmag = torch.log1p(mag)
    return logmag, phase

def logmag_phase_to_complex(logmag, phase):
    mag = torch.expm1(logmag).clamp(min=0.0)
    real = mag * torch.cos(phase)
    imag = mag * torch.sin(phase)
    return torch.complex(real, imag)


# ============================================================
# EMBEDDER
# ============================================================

def embed_nibble_into_logmag(logmag, bits4, strength, cfg):
    B, F, TT = logmag.shape
    out = logmag.clone()

    t0 = cfg["time_frame_margin"]
    t1 = TT - cfg["time_frame_margin"]
    if t1 <= t0:
        t0, t1 = 0, TT

    for bit_idx, (f0, f1) in enumerate(cfg["bit_bands"]):
        f0 = max(0, min(F, f0))
        f1 = max(0, min(F, f1))
        if f1 <= f0:
            continue

        signs = bits4[:, bit_idx] * 2.0 - 1.0
        signs = signs.view(B, 1, 1)
        out[:, f0:f1, t0:t1] = out[:, f0:f1, t0:t1] + strength * signs

    return out

def make_stego_from_cover_and_bits(cover_wav, bits4, strength, cfg):
    X = stft_complex_batch(cover_wav, cfg)
    cover_logmag, phase = complex_to_logmag_phase(X)

    stego_logmag = embed_nibble_into_logmag(cover_logmag, bits4, strength, cfg)
    X_stego = logmag_phase_to_complex(stego_logmag, phase)

    stego_wav = istft_complex_batch(X_stego, target_len=cover_wav.size(-1), cfg=cfg)
    stego_wav = stego_wav.clamp(-1.0, 1.0)

    return stego_wav


# ============================================================
# DECODER HELPERS
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
    return bits4_to_nibble(bits), bits

@torch.no_grad()
def decode_message_from_stego_chunks(decoder, stego_chunks, cfg, device):
    pred_chunk_nibbles = []
    pred_chunk_bits = []

    for i in range(stego_chunks.size(0)):
        n, bits = decode_single_chunk_to_nibble(decoder, stego_chunks[i:i + 1], cfg, device)
        pred_chunk_nibbles.append(n)
        pred_chunk_bits.append(bits)

    voted_nibbles = majority_vote_repeated_nibbles(
        pred_chunk_nibbles,
        repeat_factor=cfg["repeat_factor"]
    )
    recovered_text = nibble_sequence_to_text(voted_nibbles)

    return voted_nibbles, recovered_text, pred_chunk_nibbles, pred_chunk_bits


# ============================================================
# DEBUG / ANALYSIS HELPERS
# ============================================================

def encode_message_to_stego_chunks(cover_chunks, text, cfg):
    text = safe_ascii_text(text)
    raw_nibbles = text_to_nibble_sequence(text)
    repeated_nibbles = repeat_nibbles(raw_nibbles, repeat_factor=cfg["repeat_factor"])

    needed = len(repeated_nibbles)
    assert cover_chunks.size(0) >= needed, f"Need {needed} chunks, got {cover_chunks.size(0)}"

    bits = torch.tensor(
        [nibble_to_bits4(n) for n in repeated_nibbles],
        device=cover_chunks.device,
        dtype=torch.float32
    )

    stego_chunks = make_stego_from_cover_and_bits(
        cover_chunks[:needed],
        bits,
        strength=cfg["embed_strength_val"],   # LOCKED NORMAL MODE
        cfg=cfg
    )

    return stego_chunks, raw_nibbles, repeated_nibbles

def split_text_chars(s):
    return [c for c in s]

def char_nibbles(ch):
    b = char_to_byte(ch)
    return byte_to_nibbles(b)

def format_bits4(n):
    return ''.join(str(x) for x in nibble_to_bits4(n))

def compare_texts(expected, got):
    max_len = max(len(expected), len(got))
    rows = []
    for i in range(max_len):
        e = expected[i] if i < len(expected) else None
        g = got[i] if i < len(got) else None
        rows.append((i, e, g, e == g))
    return rows

def find_first_char_mismatch(expected, got):
    max_len = max(len(expected), len(got))
    for i in range(max_len):
        e = expected[i] if i < len(expected) else None
        g = got[i] if i < len(got) else None
        if e != g:
            return i
    return None

def print_char_level_diff(expected, got, label):
    print("=" * 100)
    print(f"{label} :: CHARACTER COMPARISON")
    print("=" * 100)
    print("Expected:", repr(expected))
    print("Got     :", repr(got))
    print("-" * 100)

    mismatch_count = 0
    for idx, e, g, ok in compare_texts(expected, got):
        if ok:
            continue
        mismatch_count += 1
        print(f"[CHAR MISMATCH] idx={idx} expected={repr(e)} got={repr(g)}")

        if e is not None:
            e_hi, e_lo = char_nibbles(e)
            print(f"  expected byte=0x{char_to_byte(e):02X} hi={e_hi}({format_bits4(e_hi)}) lo={e_lo}({format_bits4(e_lo)})")
        if g is not None:
            g_hi, g_lo = char_nibbles(g)
            print(f"  got      byte=0x{char_to_byte(g):02X} hi={g_hi}({format_bits4(g_hi)}) lo={g_lo}({format_bits4(g_lo)})")

    if mismatch_count == 0:
        print("No character mismatches.")
    print("=" * 100)

def get_char_triplet_debug(char_idx, repeated_nibbles, pred_chunk_nibbles, repeat_factor=3):
    """
    For one character:
      char -> 2 nibbles
      each nibble repeated repeat_factor times
      => 2 * repeat_factor chunks
    """
    nibble_idx_hi = char_idx * 2
    nibble_idx_lo = char_idx * 2 + 1

    # raw target nibbles
    target_hi = repeated_nibbles[nibble_idx_hi * repeat_factor]
    target_lo = repeated_nibbles[nibble_idx_lo * repeat_factor]

    # chunk spans
    hi_chunk_start = nibble_idx_hi * repeat_factor
    hi_chunk_end = hi_chunk_start + repeat_factor

    lo_chunk_start = nibble_idx_lo * repeat_factor
    lo_chunk_end = lo_chunk_start + repeat_factor

    pred_hi_triplet = pred_chunk_nibbles[hi_chunk_start:hi_chunk_end]
    pred_lo_triplet = pred_chunk_nibbles[lo_chunk_start:lo_chunk_end]

    voted_hi = majority_vote_repeated_nibbles(pred_hi_triplet, repeat_factor=repeat_factor)[0]
    voted_lo = majority_vote_repeated_nibbles(pred_lo_triplet, repeat_factor=repeat_factor)[0]

    return {
        "target_hi": target_hi,
        "target_lo": target_lo,
        "pred_hi_triplet": pred_hi_triplet,
        "pred_lo_triplet": pred_lo_triplet,
        "voted_hi": voted_hi,
        "voted_lo": voted_lo,
        "hi_chunk_span": (hi_chunk_start, hi_chunk_end - 1),
        "lo_chunk_span": (lo_chunk_start, lo_chunk_end - 1),
    }

def print_triplet_debug_around_char(char_idx, expected_text, repeated_nibbles, pred_chunk_nibbles, repeat_factor=3, radius=1, label=""):
    print("=" * 100)
    print(f"{label} :: TRIPLET DEBUG AROUND CHAR {char_idx}")
    print("=" * 100)

    start = max(0, char_idx - radius)
    end = min(len(expected_text) - 1, char_idx + radius)

    for ci in range(start, end + 1):
        dbg = get_char_triplet_debug(ci, repeated_nibbles, pred_chunk_nibbles, repeat_factor=repeat_factor)
        ch = expected_text[ci]

        print(f"[char {ci}] expected={repr(ch)} byte=0x{char_to_byte(ch):02X}")

        print(
            f"  HI target={dbg['target_hi']} ({format_bits4(dbg['target_hi'])}) "
            f"chunks={dbg['hi_chunk_span']} "
            f"pred_triplet={dbg['pred_hi_triplet']} "
            f"voted={dbg['voted_hi']} ({format_bits4(dbg['voted_hi'])})"
        )

        print(
            f"  LO target={dbg['target_lo']} ({format_bits4(dbg['target_lo'])}) "
            f"chunks={dbg['lo_chunk_span']} "
            f"pred_triplet={dbg['pred_lo_triplet']} "
            f"voted={dbg['voted_lo']} ({format_bits4(dbg['voted_lo'])})"
        )

        voted_char = byte_to_char(nibbles_to_byte(dbg["voted_hi"], dbg["voted_lo"]))
        print(f"  voted_char={repr(voted_char)}")
        print("-" * 100)

    print("=" * 100)

def compute_snr_db(cover, stego):
    if cover.dim() == 2:
        cover = cover.squeeze(0)
    if stego.dim() == 2:
        stego = stego.squeeze(0)

    noise = stego - cover
    sig_pow = torch.mean(cover ** 2).item() + 1e-12
    noi_pow = torch.mean(noise ** 2).item() + 1e-12
    return 10.0 * math.log10(sig_pow / noi_pow)

def print_config_summary(cfg):
    print("=" * 100)
    print("CONFIG SUMMARY")
    print("=" * 100)
    keys = [
        "sample_rate",
        "chunk_seconds",
        "chunk_samples",
        "n_fft",
        "hop_length",
        "win_length",
        "logical_bits_per_chunk",
        "repeat_factor",
        "chunks_per_char_protected",
        "embed_strength",
        "embed_strength_val",
        "time_frame_margin",
        "bit_bands",
    ]
    for k in keys:
        print(f"{k:26s}: {cfg.get(k)}")
    print("=" * 100)


# ============================================================
# MAIN
# ============================================================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--weights", required=True)
    parser.add_argument("--cover", required=True)
    parser.add_argument("--text", required=True)
    parser.add_argument("--out", default="debug_roundtrip_stego.wav")
    parser.add_argument("--float-save", action="store_true", help="Save as 32-bit float WAV")
    args = parser.parse_args()

    cfg = load_cfg(args.config)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    text = safe_ascii_text(args.text)
    repeat_factor = int(cfg["repeat_factor"])

    print("=" * 100)
    print("AURA V2-R DEBUG ROUNDTRIP")
    print("=" * 100)
    print("Device             :", device)
    print("Config             :", args.config)
    print("Weights            :", args.weights)
    print("Cover              :", args.cover)
    print("Text               :", repr(text))
    print("Output             :", args.out)
    print("Float save         :", args.float_save)
    print("=" * 100)

    print_config_summary(cfg)

    # Load model
    decoder = AuraV2RDecoder(
        out_bits=cfg["logical_bits_per_chunk"],
        base_ch=32
    ).to(device)

    ckpt = torch.load(args.weights, map_location=device)
    decoder.load_state_dict(ckpt["decoder_state_dict"])
    decoder.eval()

    print("=" * 100)
    print("CHECKPOINT SUMMARY")
    print("=" * 100)
    print("Epoch             :", ckpt.get("epoch", "N/A"))
    print("Best combined     :", ckpt.get("best_combined", "N/A"))
    if "val_stats" in ckpt:
        print("Val stats         :", ckpt["val_stats"])
    print("=" * 100)

    # Requirements
    required_chunks = len(text) * cfg["chunks_per_char_protected"]
    required_seconds = required_chunks * cfg["chunk_seconds"]

    print("=" * 100)
    print("PAYLOAD REQUIREMENTS")
    print("=" * 100)
    print("Chars             :", len(text))
    print("Required chunks   :", required_chunks)
    print("Required seconds  :", required_seconds)
    print("Required minutes  :", required_seconds / 60.0)
    print("=" * 100)

    # Load cover and build chunks (same sender path)
    cover_wav, _ = load_audio_mono_16k_cover(args.cover, target_sr=cfg["sample_rate"])
    cover_chunks = build_cover_chunks_for_message(
        cover_wav,
        total_chunks_needed=required_chunks,
        chunk_len=cfg["chunk_samples"]
    )

    # Encode in memory
    stego_chunks, raw_nibbles, repeated_nibbles = encode_message_to_stego_chunks(
        cover_chunks,
        text,
        cfg
    )

    print("=" * 100)
    print("IN-MEMORY ENCODE SUMMARY")
    print("=" * 100)
    print("Raw nibble count  :", len(raw_nibbles))
    print("Repeat count      :", len(repeated_nibbles))
    print("Stego chunks      :", stego_chunks.shape)
    print("Example chunk SNR :", round(compute_snr_db(cover_chunks[0], stego_chunks[0]), 4), "dB")
    print("=" * 100)

    # 1) IN-MEMORY DECODE
    voted_nibbles_mem, recovered_text_mem, pred_chunk_nibbles_mem, pred_chunk_bits_mem = decode_message_from_stego_chunks(
        decoder,
        stego_chunks,
        cfg,
        device
    )

    print("=" * 100)
    print("RESULT 1 :: IN-MEMORY DECODE (BEFORE SAVE)")
    print("=" * 100)
    print("Recovered text    :", repr(recovered_text_mem))
    print("Exact match       :", recovered_text_mem == text)
    print("First 24 nibbles  :", pred_chunk_nibbles_mem[:24])
    print("=" * 100)

    print_char_level_diff(text, recovered_text_mem, "IN-MEMORY")

    mem_mismatch = find_first_char_mismatch(text, recovered_text_mem)
    if mem_mismatch is not None:
        print_triplet_debug_around_char(
            mem_mismatch,
            text,
            repeated_nibbles,
            pred_chunk_nibbles_mem,
            repeat_factor=repeat_factor,
            radius=1,
            label="IN-MEMORY"
        )

    # Save long WAV
    stego_long = stego_chunks.cpu().squeeze(1).reshape(-1).unsqueeze(0)

    if args.float_save:
        torchaudio.save(
            args.out,
            stego_long,
            sample_rate=cfg["sample_rate"],
            encoding="PCM_F",
            bits_per_sample=32
        )
    else:
        torchaudio.save(
            args.out,
            stego_long,
            sample_rate=cfg["sample_rate"]
        )

    print("=" * 100)
    print("FILE SAVE COMPLETE")
    print("=" * 100)
    print("Saved to          :", args.out)
    print("Saved samples     :", stego_long.shape[-1])
    print("Expected samples  :", required_chunks * cfg["chunk_samples"])
    print("Sample exact      :", stego_long.shape[-1] == required_chunks * cfg["chunk_samples"])
    print("=" * 100)

    # 2) RELOAD + RECHUNK
    wav_reload, _ = load_audio_mono_16k_decode(args.out, target_sr=cfg["sample_rate"])
    reload_chunks = chunk_audio_tensor(wav_reload, cfg["chunk_samples"])

    print("=" * 100)
    print("RELOAD / RECHUNK SUMMARY")
    print("=" * 100)
    print("Reload samples    :", wav_reload.shape[-1])
    print("Reload chunks     :", reload_chunks.shape[0])
    print("Expected chunks   :", required_chunks)
    print("Chunk exact       :", reload_chunks.shape[0] == required_chunks)
    print("=" * 100)

    if reload_chunks.shape[0] != required_chunks:
        print("WARNING: Chunk count mismatch after reload.")
        print("This strongly suggests a round-trip / boundary issue.")
        print("=" * 100)

    # If extra chunks somehow appear, trim to expected for fair comparison
    usable_chunks = min(reload_chunks.shape[0], required_chunks)
    reload_chunks = reload_chunks[:usable_chunks]

    # 3) ROUNDTRIP DECODE
    voted_nibbles_rt, recovered_text_rt, pred_chunk_nibbles_rt, pred_chunk_bits_rt = decode_message_from_stego_chunks(
        decoder,
        reload_chunks,
        cfg,
        device
    )

    # If trimmed chunks reduced payload, trim expected text accordingly for comparison
    usable_nibble_count = len(voted_nibbles_rt)
    usable_char_count = usable_nibble_count // 2
    expected_text_rt = text[:usable_char_count]

    print("=" * 100)
    print("RESULT 2 :: ROUND-TRIP DECODE (AFTER SAVE -> RELOAD)")
    print("=" * 100)
    print("Recovered text    :", repr(recovered_text_rt))
    print("Expected text     :", repr(expected_text_rt))
    print("Exact match       :", recovered_text_rt == expected_text_rt)
    print("First 24 nibbles  :", pred_chunk_nibbles_rt[:24])
    print("=" * 100)

    print_char_level_diff(expected_text_rt, recovered_text_rt, "ROUND-TRIP")

    rt_mismatch = find_first_char_mismatch(expected_text_rt, recovered_text_rt)
    if rt_mismatch is not None:
        print_triplet_debug_around_char(
            rt_mismatch,
            expected_text_rt,
            repeated_nibbles[:usable_char_count * 2 * repeat_factor],
            pred_chunk_nibbles_rt,
            repeat_factor=repeat_factor,
            radius=1,
            label="ROUND-TRIP"
        )

    # 4) DIRECT COMPARISON MEM vs RT
    print("=" * 100)
    print("FINAL DIAGNOSIS")
    print("=" * 100)

    mem_exact = (recovered_text_mem == text)
    rt_exact = (recovered_text_rt == expected_text_rt)

    if mem_exact and not rt_exact:
        print("DIAGNOSIS: In-memory is perfect, round-trip is not.")
        print("=> Model is fine.")
        print("=> Problem is FILE ROUND-TRIP / WAV serialization / chunk-boundary sensitivity.")
    elif (not mem_exact) and (not rt_exact):
        print("DIAGNOSIS: In-memory already fails.")
        print("=> Problem is NOT the save/load step.")
        print("=> Most likely local code/config/weights mismatch OR borderline carrier region.")
    elif mem_exact and rt_exact:
        print("DIAGNOSIS: Both in-memory and round-trip are perfect.")
        print("=> Current path is stable for this test case.")
        print("=> If app still fails, frontend/backend pipeline is altering the audio elsewhere.")
    else:
        print("DIAGNOSIS: Strange case (round-trip better than in-memory).")
        print("=> Re-check exact files and environment.")

    print("-" * 100)
    print("MEM exact         :", mem_exact)
    print("RT exact          :", rt_exact)
    print("MEM text          :", repr(recovered_text_mem))
    print("RT text           :", repr(recovered_text_rt))
    print("=" * 100)


if __name__ == "__main__":
    main()