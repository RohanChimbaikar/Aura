import os
import json
import argparse
import struct
import time
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
# COMPACT HEADER SETTINGS
# 24 bytes => 48 nibbles
# ------------------------------------------------------------
HEADER_BYTES = 24
HEADER_NIBBLES = 48


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
# protocol and ecc helpers
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


def hamming_8_4_encode_nibble(nibble: int):
    # nibble is 4 bits: d0, d1, d2, d3
    d = [(nibble >> i) & 1 for i in range(4)]
    d1, d2, d3, d4 = d[0], d[1], d[2], d[3]
    p1 = d1 ^ d2 ^ d4
    p2 = d1 ^ d3 ^ d4
    p3 = d2 ^ d3 ^ d4
    c7 = [p1, p2, d1, p3, d2, d3, d4]
    p4 = p1 ^ p2 ^ d1 ^ p3 ^ d2 ^ d3 ^ d4
    b = (p1 << 7) | (p2 << 6) | (d1 << 5) | (p3 << 4) | (d2 << 3) | (d3 << 2) | (d4 << 1) | p4
    return (b >> 4) & 0x0F, b & 0x0F


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
def encode_message_to_stego_chunks(cover_chunks, text, transmission_id, part_index, total_parts, ecc_scheme, codec_hint, cfg, payload_bytes=None):
    """
    Structured as a network packet:
    [SYNC_MARKER (12 nibbles)] [HEADER (48 nibbles)] [PAYLOAD_NIBBLES (P nibbles)] [SYNC_MARKER (12 nibbles)]
    """
    if payload_bytes is None:
        text = safe_ascii_text(text)
        payload_bytes = text.encode("ascii", errors="ignore")
    payload_len = len(payload_bytes)
    crc_payload = crc16(payload_bytes)

    # 1. Determine payload nibbles
    if ecc_scheme == 1:
        payload_nibbles = []
        for b in payload_bytes:
            hi, lo = byte_to_nibbles(b)
            h_hi, h_lo = hamming_8_4_encode_nibble(hi)
            payload_nibbles.extend([h_hi, h_lo])
            l_hi, l_lo = hamming_8_4_encode_nibble(lo)
            payload_nibbles.extend([l_hi, l_lo])
    else:
        payload_nibbles = []
        for b in payload_bytes:
            hi, lo = byte_to_nibbles(b)
            payload_nibbles.extend([hi, lo])

    # 2. Apply repeat factor to payload
    repeat_factor = cfg["repeat_factor"]
    repeated_payload_nibbles = repeat_nibbles(payload_nibbles, repeat_factor=repeat_factor)

    # 3. Compute total chunks (header is repeated too)
    sync_pattern = [10, 10, 4, 1, 5, 5, 5, 2, 4, 1, 10, 10]
    repeated_header_count = 48 * repeat_factor
    total_chunks = 12 + repeated_header_count + len(repeated_payload_nibbles) + 12

    # 4. Pack header
    timestamp = int(time.time())
    header_bytes_without_chk = struct.pack(
        ">4sB I B B H H H B B I",
        b"AURA",
        1,               # Version
        transmission_id,
        part_index,
        total_parts,
        payload_len,
        crc_payload,
        total_chunks,
        ecc_scheme,
        codec_hint,
        timestamp
    )
    header_checksum = sum(header_bytes_without_chk) % 256
    header_bytes = header_bytes_without_chk + struct.pack("B", header_checksum)

    # 5. Convert header bytes to nibbles
    header_nibbles = []
    for b in header_bytes:
        hi, lo = byte_to_nibbles(b)
        header_nibbles.extend([hi, lo])

    # 5b. Apply repeat factor to header
    repeated_header_nibbles = repeat_nibbles(header_nibbles, repeat_factor=repeat_factor)

    # 6. Final sequence of nibbles
    all_nibbles = sync_pattern + repeated_header_nibbles + repeated_payload_nibbles + sync_pattern
    
    needed = len(all_nibbles)
    assert cover_chunks.size(0) >= needed, f"Need {needed} chunks, got {cover_chunks.size(0)}"

    bits = torch.tensor(
        [nibble_to_bits4(n) for n in all_nibbles],
        device=cover_chunks.device,
        dtype=torch.float32
    )

    stego_chunks = make_stego_from_cover_and_bits(
        cover_chunks[:needed],
        bits,
        strength=cfg["embed_strength_val"],   # LOCKED NORMAL MODE
        cfg=cfg
    )

    return stego_chunks, header_nibbles, payload_nibbles, all_nibbles, repeated_payload_nibbles


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
    parser.add_argument("--text", default=None, help="Secret text")
    parser.add_argument("--payload-hex", default=None, help="Hex payload bytes (bypass text check)")
    parser.add_argument("--out", required=True, help="Output stego wav")
    parser.add_argument("--transmission-id", type=int, default=0)
    parser.add_argument("--part-index", type=int, default=0)
    parser.add_argument("--total-parts", type=int, default=1)
    parser.add_argument("--ecc-scheme", type=int, default=0)
    parser.add_argument("--codec-hint", type=int, default=0)
    args = parser.parse_args()

    cfg = load_cfg(args.config)
    
    if args.payload_hex is not None:
        payload_bytes = bytes.fromhex(args.payload_hex)
        text = payload_bytes.decode("ascii", errors="replace")
    else:
        if args.text is None:
            raise ValueError("Either --text or --payload-hex must be provided")
        text = safe_ascii_text(args.text)
        payload_bytes = text.encode("ascii", errors="ignore")

    msg_len = len(payload_bytes)

    # Calculate required chunks under the new framing protocol
    # sync(12) + header_repeated + payload_repeated + sync(12)
    if args.ecc_scheme == 1:
        payload_nibbles_count = msg_len * 4
    else:
        payload_nibbles_count = msg_len * 2

    repeat_factor = cfg["repeat_factor"]
    repeated_payload_count = payload_nibbles_count * repeat_factor
    repeated_header_count = 48 * repeat_factor
    required_chunks = 12 + repeated_header_count + repeated_payload_count + 12
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
    print("AURA V2-R SENDER (COVERT PACKET ARCHITECTURE)")
    print("=" * 80)
    print("Text               :", repr(text))
    print("Chars              :", msg_len)
    print("Transmission ID    :", args.transmission_id)
    print("Part Index         :", args.part_index)
    print("Total Parts        :", args.total_parts)
    print("ECC Scheme         :", "Hamming(8,4)" if args.ecc_scheme == 1 else "None")
    print("Codec Hint         :", args.codec_hint)
    print("Required chunks    :", required_chunks)
    print("Required seconds   :", round(required_seconds, 2))
    print("Mode               :", "SAFE MODE" if args.safe_mode else "MANUAL MODE")
    print("Chosen cover       :", chosen_cover)
    print("Cover duration     :", round(chosen_cover_duration, 2), "sec")
    print("Embed strength     :", cfg["embed_strength_val"], "(LOCKED FROM CONFIG)")

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
        cover_chunks, text, args.transmission_id, args.part_index, args.total_parts, args.ecc_scheme, args.codec_hint, cfg, payload_bytes=payload_bytes
    )

    stego_long = stego_chunks.cpu().squeeze(1).reshape(-1).unsqueeze(0)

    torchaudio.save(
        args.out,
        stego_long,
        sample_rate=cfg["sample_rate"]
    )

    print("Header raw nibbles :", len(header_nibbles))
    print("Payload nibbles    :", len(payload_nibbles))
    print("Total chunks       :", len(all_raw_nibbles))
    print("Repeated nibbles   :", len(repeated_nibbles))
    print("Saved stego file   :", args.out)
    print("=" * 80)


if __name__ == "__main__":
    main()