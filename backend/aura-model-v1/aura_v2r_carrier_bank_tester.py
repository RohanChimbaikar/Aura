import os
import json
import math
import argparse
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
import torchaudio

# ============================================================
# AURA V2-R CARRIER BANK TESTER
# Tests many carrier WAVs with the SAME message using:
#   cover -> embed (in-memory) -> decode (in-memory)
# No save/load confusion.
# Goal: find which carriers are exact-safe for V2-R repeat-3.
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
# CONFIG / TEXT HELPERS
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
    wav, sr = torchaudio.load(path)
    if wav.size(0) > 1:
        wav = wav.mean(dim=0, keepdim=True)
    if sr != target_sr:
        wav = torchaudio.functional.resample(wav, sr, target_sr)

    # same cover normalization as V2-R sender/training style
    peak = wav.abs().max().item()
    if peak > 0:
        wav = wav / max(peak, 1e-8) * 0.95

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
    SAME as your sender logic.
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
            # same fallback as your sender
            start = max(0, Tfull - chunk_len)
            ch = base_wav[:, start:start + chunk_len]

        if ch.size(1) != chunk_len:
            ch = center_crop_or_pad(ch, chunk_len)

        chunks.append(ch)

    return torch.stack(chunks, dim=0)  # [N,1,T]


# ============================================================
# STFT / ISTFT / EMBED
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
# DECODE HELPERS
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
# METRICS / DEBUG
# ============================================================

def compute_snr_db(cover, stego):
    if cover.dim() == 2:
        cover = cover.squeeze(0)
    if stego.dim() == 2:
        stego = stego.squeeze(0)

    noise = stego - cover
    sig_pow = torch.mean(cover ** 2).item() + 1e-12
    noi_pow = torch.mean(noise ** 2).item() + 1e-12
    return 10.0 * math.log10(sig_pow / noi_pow)

def find_first_char_mismatch(expected, got):
    max_len = max(len(expected), len(got))
    for i in range(max_len):
        e = expected[i] if i < len(expected) else None
        g = got[i] if i < len(got) else None
        if e != g:
            return i
    return None

def mismatch_detail(expected, got):
    idx = find_first_char_mismatch(expected, got)
    if idx is None:
        return None

    e = expected[idx] if idx < len(expected) else None
    g = got[idx] if idx < len(got) else None

    detail = {
        "index": idx,
        "expected_char": e,
        "got_char": g,
    }

    if e is not None:
        eb = char_to_byte(e)
        ehi, elo = byte_to_nibbles(eb)
        detail["expected_byte_hex"] = f"0x{eb:02X}"
        detail["expected_hi"] = ehi
        detail["expected_lo"] = elo

    if g is not None:
        gb = char_to_byte(g)
        ghi, glo = byte_to_nibbles(gb)
        detail["got_byte_hex"] = f"0x{gb:02X}"
        detail["got_hi"] = ghi
        detail["got_lo"] = glo

    return detail

def list_wav_files(folder):
    p = Path(folder)
    if not p.exists():
        raise FileNotFoundError(f"Carrier folder not found: {folder}")
    files = sorted([str(x) for x in p.glob("*.wav")])
    return files


# ============================================================
# TEST ONE CARRIER
# ============================================================

def test_one_carrier(decoder, cfg, device, carrier_path, text):
    text = safe_ascii_text(text)
    required_chunks = len(text) * cfg["chunks_per_char_protected"]

    cover_wav, _ = load_audio_mono_16k_cover(carrier_path, target_sr=cfg["sample_rate"])
    cover_chunks = build_cover_chunks_for_message(
        cover_wav,
        total_chunks_needed=required_chunks,
        chunk_len=cfg["chunk_samples"]
    )

    raw_nibbles = text_to_nibble_sequence(text)
    repeated_nibbles = repeat_nibbles(raw_nibbles, repeat_factor=cfg["repeat_factor"])

    bits = torch.tensor(
        [nibble_to_bits4(n) for n in repeated_nibbles],
        device=cover_chunks.device,
        dtype=torch.float32
    )

    stego_chunks = make_stego_from_cover_and_bits(
        cover_chunks,
        bits,
        strength=cfg["embed_strength_val"],  # locked normal mode
        cfg=cfg
    )

    voted_nibbles, recovered_text, pred_chunk_nibbles, pred_chunk_bits = decode_message_from_stego_chunks(
        decoder,
        stego_chunks,
        cfg,
        device
    )

    exact = (recovered_text == text)
    first_bad = find_first_char_mismatch(text, recovered_text)
    detail = mismatch_detail(text, recovered_text)

    snr_db = compute_snr_db(cover_chunks[0], stego_chunks[0])

    return {
        "carrier": carrier_path,
        "exact": exact,
        "recovered_text": recovered_text,
        "first_bad": first_bad,
        "detail": detail,
        "snr_db": snr_db,
        "pred_chunk_nibbles": pred_chunk_nibbles,
    }


# ============================================================
# MAIN
# ============================================================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--weights", required=True)
    parser.add_argument("--carrier-dir", required=True, help="Folder containing .wav carrier files")
    parser.add_argument("--text", required=True)
    parser.add_argument("--show-all", action="store_true", help="Show recovered text for every carrier")
    args = parser.parse_args()

    cfg = load_cfg(args.config)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    text = safe_ascii_text(args.text)

    carriers = list_wav_files(args.carrier_dir)
    if len(carriers) == 0:
        raise RuntimeError(f"No .wav files found in: {args.carrier_dir}")

    decoder = AuraV2RDecoder(
        out_bits=cfg["logical_bits_per_chunk"],
        base_ch=32
    ).to(device)

    ckpt = torch.load(args.weights, map_location=device)
    decoder.load_state_dict(ckpt["decoder_state_dict"])
    decoder.eval()

    print("=" * 120)
    print("AURA V2-R CARRIER BANK TESTER")
    print("=" * 120)
    print("Device             :", device)
    print("Config             :", args.config)
    print("Weights            :", args.weights)
    print("Carrier dir        :", args.carrier_dir)
    print("Carrier count      :", len(carriers))
    print("Text               :", repr(text))
    print("Chars              :", len(text))
    print("Required chunks    :", len(text) * cfg["chunks_per_char_protected"])
    print("Checkpoint epoch   :", ckpt.get("epoch", "N/A"))
    print("Best combined      :", ckpt.get("best_combined", "N/A"))
    print("=" * 120)

    results = []

    for i, carrier in enumerate(carriers, 1):
        print(f"[{i}/{len(carriers)}] Testing: {os.path.basename(carrier)}")
        try:
            res = test_one_carrier(decoder, cfg, device, carrier, text)
            results.append(res)

            if res["exact"]:
                print("   -> EXACT PASS")
            else:
                print(f"   -> FAIL at char index {res['first_bad']}")
                if res["detail"] is not None:
                    d = res["detail"]
                    print(f"      expected={repr(d.get('expected_char'))} got={repr(d.get('got_char'))}")
                    print(f"      expected_byte={d.get('expected_byte_hex')} got_byte={d.get('got_byte_hex')}")
                    print(f"      expected_hi/lo={d.get('expected_hi')}/{d.get('expected_lo')} got_hi/lo={d.get('got_hi')}/{d.get('got_lo')}")

            if args.show_all:
                print(f"      recovered={repr(res['recovered_text'])}")

        except Exception as e:
            print(f"   -> ERROR: {e}")
            results.append({
                "carrier": carrier,
                "exact": False,
                "recovered_text": None,
                "first_bad": None,
                "detail": None,
                "snr_db": None,
                "error": str(e),
            })

        print("-" * 120)

    # Summary
    valid_results = [r for r in results if "error" not in r]
    exact_passes = [r for r in valid_results if r["exact"]]
    fails = [r for r in valid_results if not r["exact"]]
    errors = [r for r in results if "error" in r]

    print("\n" + "=" * 120)
    print("SUMMARY")
    print("=" * 120)
    print("Total carriers     :", len(results))
    print("Valid tested       :", len(valid_results))
    print("Exact passes       :", len(exact_passes))
    print("Fails              :", len(fails))
    print("Errors             :", len(errors))
    if len(valid_results) > 0:
        print("Exact pass rate    :", f"{100.0 * len(exact_passes) / len(valid_results):.2f}%")
    print("=" * 120)

    # Exact pass list
    print("\n" + "=" * 120)
    print("EXACT PASS CARRIERS")
    print("=" * 120)
    if exact_passes:
        for r in exact_passes:
            print(os.path.basename(r["carrier"]))
    else:
        print("None")
    print("=" * 120)

    # Fail list
    print("\n" + "=" * 120)
    print("FAILED CARRIERS")
    print("=" * 120)
    if fails:
        for r in fails:
            base = os.path.basename(r["carrier"])
            d = r["detail"]
            if d is not None:
                print(
                    f"{base} | first_bad={r['first_bad']} | "
                    f"expected={repr(d.get('expected_char'))} -> got={repr(d.get('got_char'))} | "
                    f"{d.get('expected_byte_hex')} -> {d.get('got_byte_hex')}"
                )
            else:
                print(f"{base} | first_bad={r['first_bad']}")
    else:
        print("None")
    print("=" * 120)

    # Best recommendation
    print("\n" + "=" * 120)
    print("APP RECOMMENDATION")
    print("=" * 120)
    if exact_passes:
        print("Use ONLY these carriers for exact-text V2-R demo/app with this message length:")
        for r in exact_passes:
            print(" -", os.path.basename(r["carrier"]))
        print("")
        print("Best immediate app policy:")
        print("1) Pre-test carriers offline")
        print("2) Keep only exact-pass carriers in the approved pool")
        print("3) App auto-selects from approved pool")
    else:
        print("No carriers passed exactly for this message.")
        print("Recommended next step:")
        print("1) Try a different message")
        print("2) Or use stronger redundancy (repeat-5 mode)")
        print("3) Or implement chunk-quality selection instead of blind sequential chunks")
    print("=" * 120)


if __name__ == "__main__":
    main()