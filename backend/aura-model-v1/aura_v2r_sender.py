import os
import json
import argparse
from pathlib import Path

import torch
import torch.nn.functional as F
import torchaudio

# ============================================================
# AURA V2-R SENDER
# Deterministic spectral embedder (no neural encoder)
#
# FINAL SAFE-MODE + LENGTH HEADER VERSION
# - Keeps old manual --cover mode
# - Adds safe carrier auto-select mode
# - Uses approved carrier whitelist
# - Auto-picks smallest approved carrier that fits
# - Cross-platform duration check (NO torchaudio.info)
# - Saves 32-bit float WAV
# - Adds 2-byte message-length header (4 nibbles -> repeat-3 -> 12 chunks)
# ============================================================

# ------------------------------------------------------------
# APPROVED SAFE CARRIERS (based on your validated carrier bank test)
# ------------------------------------------------------------
APPROVED_SAFE_CARRIERS = [
    "carrier_01_02min.wav",
    "carrier_02_04min.wav",
    "carrier_03_06min.wav",
    "carrier_05_10min.wav",
]

# Explicitly avoid these (known failures in your test)
REJECTED_CARRIERS = [
    "carrier_04_08min.wav",
    "carrier_06_12min.wav",
]

# ------------------------------------------------------------
# LENGTH HEADER SETTINGS
# 2 bytes => 4 nibbles => repeat-3 => 12 chunks
# ------------------------------------------------------------
HEADER_BYTES = 2
HEADER_NIBBLES = HEADER_BYTES * 2  # 4


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


def char_to_byte(ch):
    return ord(ch) & 0xFF


def byte_to_nibbles(byte_val):
    byte_val = int(byte_val) & 0xFF
    hi = (byte_val >> 4) & 0x0F
    lo = byte_val & 0x0F
    return hi, lo


def text_to_nibble_sequence(text):
    text = safe_ascii_text(text)
    nibbles = []
    for ch in text:
        b = char_to_byte(ch)
        hi, lo = byte_to_nibbles(b)
        nibbles.append(hi)
        nibbles.append(lo)
    return nibbles


def repeat_nibbles(nibbles, repeat_factor=3):
    out = []
    for n in nibbles:
        out.extend([n] * repeat_factor)
    return out


# ============================================================
# LENGTH HEADER HELPERS
# ============================================================

def length_to_header_nibbles(msg_len):
    """
    Store message length as 2-byte unsigned integer (big-endian).
    Returns 4 nibbles total.
    """
    if not (0 <= msg_len <= 65535):
        raise ValueError("Message too long for 2-byte length header (max 65535 chars).")

    b0 = (msg_len >> 8) & 0xFF
    b1 = msg_len & 0xFF

    b0_hi, b0_lo = byte_to_nibbles(b0)
    b1_hi, b1_lo = byte_to_nibbles(b1)

    return [b0_hi, b0_lo, b1_hi, b1_lo]


def get_header_chunk_count(repeat_factor):
    return HEADER_NIBBLES * repeat_factor


def get_total_required_chunks_for_text(text_len, cfg):
    """
    Total chunks = header chunks + payload chunks
    payload chunks = text_len * chunks_per_char_protected
    """
    header_chunks = get_header_chunk_count(cfg["repeat_factor"])
    payload_chunks = text_len * cfg["chunks_per_char_protected"]
    return header_chunks + payload_chunks


def build_all_raw_nibbles_with_header(text):
    """
    Returns:
      header_nibbles, payload_nibbles, all_raw_nibbles
    """
    text = safe_ascii_text(text)
    msg_len = len(text)

    header_nibbles = length_to_header_nibbles(msg_len)
    payload_nibbles = text_to_nibble_sequence(text)
    all_raw_nibbles = header_nibbles + payload_nibbles

    return header_nibbles, payload_nibbles, all_raw_nibbles


def load_audio_mono_16k(path, target_sr=16000):
    wav, sr = torchaudio.load(path)
    if wav.size(0) > 1:
        wav = wav.mean(dim=0, keepdim=True)
    if sr != target_sr:
        wav = torchaudio.functional.resample(wav, sr, target_sr)
        sr = target_sr

    peak = wav.abs().max().item()
    if peak > 0:
        wav = wav / max(peak, 1e-8) * 0.95

    return wav.float(), sr


def center_crop_or_pad(wav, target_len):
    T = wav.size(1)
    if T == target_len:
        return wav
    if T > target_len:
        start = max(0, (T - target_len) // 2)
        return wav[:, start:start + target_len]
    pad_total = target_len - target_len if False else (target_len - T)
    pad_left = pad_total // 2
    pad_right = pad_total - pad_left
    return F.pad(wav, (pad_left, pad_right))


def build_cover_chunks_for_message(base_wav, total_chunks_needed, chunk_len):
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
            # same original fallback behavior
            start = max(0, Tfull - chunk_len)
            ch = base_wav[:, start:start + chunk_len]

        if ch.size(1) != chunk_len:
            ch = center_crop_or_pad(ch, chunk_len)

        chunks.append(ch)

    return torch.stack(chunks, dim=0)


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


@torch.no_grad()
def encode_message_to_stego_chunks(cover_chunks, text, cfg):
    """
    NEW:
    Encodes [header][payload] instead of payload-only.
    Header stores message length (2 bytes => 4 nibbles).
    """
    text = safe_ascii_text(text)

    header_nibbles, payload_nibbles, all_raw_nibbles = build_all_raw_nibbles_with_header(text)
    repeated_nibbles = repeat_nibbles(all_raw_nibbles, repeat_factor=cfg["repeat_factor"])

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

    return stego_chunks, header_nibbles, payload_nibbles, all_raw_nibbles, repeated_nibbles


# ============================================================
# SAFE CARRIER LOGIC
# ============================================================

def list_wav_files(folder):
    p = Path(folder)
    if not p.exists():
        raise FileNotFoundError(f"Carrier folder not found: {folder}")
    return sorted([str(x) for x in p.glob("*.wav")])


def get_audio_duration_seconds(path, target_sr=16000):
    """
    Cross-platform duration check using torchaudio.load()
    (avoids torchaudio.info() compatibility issues).
    """
    wav, sr = torchaudio.load(path)
    if wav.size(0) > 1:
        wav = wav.mean(dim=0, keepdim=True)
    if sr != target_sr:
        wav = torchaudio.functional.resample(wav, sr, target_sr)
        sr = target_sr
    if sr <= 0:
        return 0.0
    return float(wav.size(1)) / float(sr)


def can_fit_message(path, required_seconds, target_sr=16000):
    dur = get_audio_duration_seconds(path, target_sr=target_sr)
    return dur + 1e-6 >= required_seconds, dur


def select_safe_carrier(carrier_dir, required_seconds, target_sr=16000):
    all_wavs = list_wav_files(carrier_dir)

    approved_existing = []
    for full_path in all_wavs:
        name = os.path.basename(full_path)
        if name in APPROVED_SAFE_CARRIERS and name not in REJECTED_CARRIERS:
            approved_existing.append(full_path)

    if len(approved_existing) == 0:
        raise RuntimeError(
            "No approved safe carriers found in carrier directory.\n"
            f"Expected one or more of: {APPROVED_SAFE_CARRIERS}"
        )

    # choose smallest approved carrier that truly fits
    candidates = []
    for p in approved_existing:
        dur = get_audio_duration_seconds(p, target_sr=target_sr)
        candidates.append((dur, p))
    candidates.sort(key=lambda x: x[0])

    for dur, p in candidates:
        if dur + 1e-6 >= required_seconds:
            return p, dur

    raise RuntimeError(
        f"No approved safe carrier is long enough for this message.\n"
        f"Required seconds: {required_seconds:.2f}\n"
        f"Approved carriers found: {[os.path.basename(x[1]) for x in candidates]}"
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--cover", default=None, help="Manual input cover audio (old mode)")
    parser.add_argument("--carrier-dir", default=None, help="Carrier bank folder (safe mode)")
    parser.add_argument("--safe-mode", action="store_true", help="Auto-pick only approved safe carriers")
    parser.add_argument("--text", required=True, help="Secret text")
    parser.add_argument("--out", required=True, help="Output stego wav")
    args = parser.parse_args()

    cfg = load_cfg(args.config)
    text = safe_ascii_text(args.text)

    msg_len = len(text)
    header_chunks = get_header_chunk_count(cfg["repeat_factor"])
    payload_chunks = msg_len * cfg["chunks_per_char_protected"]
    required_chunks = header_chunks + payload_chunks
    required_seconds = required_chunks * cfg["chunk_seconds"]

    chosen_cover = None
    chosen_cover_duration = None

    # --------------------------------------------------------
    # COVER SELECTION
    # --------------------------------------------------------
    if args.safe_mode:
        if not args.carrier_dir:
            raise ValueError("--safe-mode requires --carrier-dir")

        chosen_cover, chosen_cover_duration = select_safe_carrier(
            args.carrier_dir,
            required_seconds=required_seconds,
            target_sr=cfg["sample_rate"]
        )

    else:
        if not args.cover:
            raise ValueError("Manual mode requires --cover (or use --safe-mode with --carrier-dir)")

        chosen_cover = args.cover
        chosen_cover_duration = get_audio_duration_seconds(
            chosen_cover,
            target_sr=cfg["sample_rate"]
        )

    print("=" * 80)
    print("AURA V2-R SENDER (LENGTH-HEADER MODE)")
    print("=" * 80)
    print("Text               :", repr(text))
    print("Chars              :", msg_len)
    print("Header bytes       :", HEADER_BYTES)
    print("Header nibbles     :", HEADER_NIBBLES)
    print("Header chunks      :", header_chunks)
    print("Payload chunks     :", payload_chunks)
    print("Required chunks    :", required_chunks)
    print("Required seconds   :", round(required_seconds, 2))
    print("Required minutes   :", round(required_seconds / 60.0, 2))
    print("Mode               :", "SAFE MODE" if args.safe_mode else "MANUAL MODE")
    print("Chosen cover       :", chosen_cover)
    print("Cover duration     :", round(chosen_cover_duration, 2), "sec")
    print("Embed strength     :", cfg["embed_strength_val"], "(LOCKED FROM CONFIG)")

    # Enforce true capacity honestly
    fits, actual_dur = can_fit_message(
        chosen_cover,
        required_seconds,
        target_sr=cfg["sample_rate"]
    )
    if not fits:
        raise RuntimeError(
            f"Selected cover too short.\n"
            f"Cover duration: {actual_dur:.2f} sec\n"
            f"Required: {required_seconds:.2f} sec"
        )

    wav, _ = load_audio_mono_16k(chosen_cover, target_sr=cfg["sample_rate"])
    cover_chunks = build_cover_chunks_for_message(
        wav,
        total_chunks_needed=required_chunks,
        chunk_len=cfg["chunk_samples"]
    )

    stego_chunks, header_nibbles, payload_nibbles, all_raw_nibbles, repeated_nibbles = encode_message_to_stego_chunks(
        cover_chunks, text, cfg
    )

    stego_long = stego_chunks.cpu().squeeze(1).reshape(-1).unsqueeze(0)

    # Save as 32-bit float WAV for best fidelity
    torchaudio.save(
    args.out,
    stego_long,
    sample_rate=cfg["sample_rate"]
)

    print("Header raw nibbles :", len(header_nibbles))
    print("Payload nibbles    :", len(payload_nibbles))
    print("Total raw nibbles  :", len(all_raw_nibbles))
    print("Repeated nibbles   :", len(repeated_nibbles))
    print("Saved stego file   :", args.out)
    print("=" * 80)


if __name__ == "__main__":
    main()