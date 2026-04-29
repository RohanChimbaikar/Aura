from __future__ import annotations

import json
import hashlib
import math
import secrets
import re
import struct
import subprocess
import sys
import time
import uuid
import wave
from pathlib import Path
from typing import Any

from services.db import get_db


BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = BASE_DIR / "aura-model-v1"
CARRIER_DIR = BASE_DIR / "aura_carrier_bank"
OUTPUT_DIR = BASE_DIR / "outputs"
ANALYSIS_ARTIFACT_DIR = OUTPUT_DIR / "analysis"
UPLOAD_DIR = BASE_DIR / "uploads"
MESSAGE_STORE = BASE_DIR / "instance" / "aura_messages.json"

SENDER_SCRIPT = MODEL_DIR / "aura_v2r_sender.py"
RECEIVER_SCRIPT = MODEL_DIR / "aura_v2r_receiver.py"
CONFIG_FILE = MODEL_DIR / "aura_v2r_config.json"
WEIGHTS_FILE = MODEL_DIR / "aura_v2r_decoder_only.pt"

APPROVED_SAFE_CARRIERS = [
    "carrier_01_02min.wav",
    "carrier_02_04min.wav",
    "carrier_03_06min.wav",
    "carrier_05_10min.wav",
]

HEADER_BYTES = 2
HEADER_NIBBLES = 4
MAX_REUSABLE_SEGMENTS = 8
MAX_TOTAL_TRANSMISSION_MINUTES = 90.0

TX_FILE_RE = re.compile(r"^tx_([0-9a-fA-F]+)_part_(\d+)_of_(\d+)\.wav$")
TERMINAL_ANALYSIS_STATUSES = {
    "complete",
    "partial",
    "failed",
    "timed_out",
    "invalid_target",
    "missing_source",
    "not_found",
    "cancelled",
}
SINGLE_ANALYSIS_TIMEOUT_SECONDS = 30.0
GROUPED_ANALYSIS_TIMEOUT_SECONDS = 60.0
COMPARE_ARTIFACT_TIMEOUT_SECONDS = 12.0


def is_terminal_status(status: str | None) -> bool:
    return (status or "") in TERMINAL_ANALYSIS_STATUSES


def ensure_dirs() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ANALYSIS_ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    MESSAGE_STORE.parent.mkdir(parents=True, exist_ok=True)


def load_cfg() -> dict[str, Any]:
    return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))


def get_wav_duration_seconds(wav_path: Path) -> float:
    with wave.open(str(wav_path), "rb") as wf:
        frames = wf.getnframes()
        rate = wf.getframerate()
        return frames / float(rate or 1)


def get_wav_props(wav_path: Path) -> dict[str, Any]:
    with wave.open(str(wav_path), "rb") as wf:
        frames = wf.getnframes()
        rate = wf.getframerate()
        channels = wf.getnchannels()
    duration = frames / float(rate or 1)
    return {
        "audio_duration_sec": round(duration, 2),
        "sample_rate": rate,
        "channels": channels,
    }


def read_mono_samples(wav_path: Path, max_samples: int = 16000 * 60) -> tuple[list[float], int]:
    with wave.open(str(wav_path), "rb") as wf:
        channels = wf.getnchannels()
        sample_width = wf.getsampwidth()
        sample_rate = wf.getframerate()
        frame_count = min(wf.getnframes(), max_samples)
        raw = wf.readframes(frame_count)

    if sample_width != 2:
        return [], sample_rate

    values = struct.unpack("<" + "h" * (len(raw) // 2), raw)
    if channels > 1:
        mono = [
            sum(values[index : index + channels]) / channels / 32768.0
            for index in range(0, len(values), channels)
        ]
    else:
        mono = [value / 32768.0 for value in values]
    return mono, sample_rate


def downsample_series(samples: list[float], points: int = 256) -> list[float]:
    if not samples:
        return []
    if len(samples) <= points:
        return [round(sample, 4) for sample in samples]
    bucket = max(1, len(samples) // points)
    output = []
    for start in range(0, len(samples), bucket):
        chunk = samples[start : start + bucket]
        if not chunk:
            continue
        peak = max(chunk, key=lambda value: abs(value))
        output.append(round(peak, 4))
        if len(output) >= points:
            break
    return output


def build_spectrogram(samples: list[float], time_bins: int = 64, freq_bins: int = 24) -> dict[str, Any]:
    if not samples:
        return {"timeBins": time_bins, "freqBins": freq_bins, "values": []}
    window = max(64, len(samples) // time_bins)
    values: list[list[float]] = []
    for bin_index in range(time_bins):
        start = bin_index * window
        chunk = samples[start : start + window]
        if len(chunk) < 8:
            chunk = samples[-window:]
        row = []
        for freq_index in range(freq_bins):
            cycles = freq_index + 1
            real = 0.0
            imag = 0.0
            for index, sample in enumerate(chunk):
                angle = 2.0 * math.pi * cycles * index / max(1, len(chunk))
                real += sample * math.cos(angle)
                imag -= sample * math.sin(angle)
            magnitude = math.sqrt(real * real + imag * imag) / max(1, len(chunk))
            row.append(round(min(1.0, magnitude * 12.0), 4))
        values.append(row)
    return {"timeBins": time_bins, "freqBins": freq_bins, "values": values}


def signal_data_for_audio(wav_path: Path | None) -> dict[str, Any]:
    if wav_path is None or not wav_path.exists():
        return {
            "waveform": [],
            "spectrogram": {"timeBins": 64, "freqBins": 24, "values": []},
            "differenceWaveform": [],
        }
    samples, _sample_rate = read_mono_samples(wav_path)
    waveform = downsample_series(samples, 320)
    energy = downsample_series([abs(sample) for sample in samples], 320)
    return {
        "waveform": waveform,
        "spectrogram": build_spectrogram(samples, 64, 24),
        "differenceWaveform": energy,
    }


def relative_audio_path(path: Path | None) -> str | None:
    if path is None:
        return None
    try:
        return str(path.relative_to(BASE_DIR)).replace("\\", "/")
    except ValueError:
        return str(path).replace("\\", "/")


def file_sha256(path: Path) -> str | None:
    if not path.exists():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def get_num_samples(wav_path: Path) -> int:
    with wave.open(str(wav_path), "rb") as wf:
        return wf.getnframes()


def bool_to_int(value: bool | None) -> int | None:
    if value is None:
        return None
    return 1 if value else 0


def ensure_audio_asset(path: Path, kind: str) -> dict[str, Any]:
    db = get_db()
    rel_path = relative_audio_path(path)
    existing = db.execute(
        """
        SELECT asset_id, kind, file_path, file_hash, sample_rate, duration_seconds, num_samples
        FROM audio_assets
        WHERE file_path = ?
        """,
        (rel_path,),
    ).fetchone()
    if existing is not None:
        return dict(existing)

    props = get_wav_props(path)
    asset = {
        "asset_id": f"asset_{uuid.uuid4().hex[:12]}",
        "kind": kind,
        "file_path": rel_path,
        "file_hash": file_sha256(path),
        "sample_rate": props.get("sample_rate"),
        "duration_seconds": props.get("audio_duration_sec"),
        "num_samples": get_num_samples(path),
    }
    db.execute(
        """
        INSERT INTO audio_assets (asset_id, kind, file_path, file_hash, sample_rate, duration_seconds, num_samples)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            asset["asset_id"],
            asset["kind"],
            asset["file_path"],
            asset["file_hash"],
            asset["sample_rate"],
            asset["duration_seconds"],
            asset["num_samples"],
        ),
    )
    db.commit()
    return asset


def save_generation_provenance(
    *,
    cover_path: Path,
    stego_path: Path,
    transmission_id: str | None,
    part_number: int | None,
    total_parts: int | None,
    payload_chars: int,
    payload_bits: int,
    chunk_count: int,
    chunk_seconds: float,
    parent_message_id: str,
    grouped: bool,
) -> dict[str, Any]:
    db = get_db()
    cover_asset = ensure_audio_asset(cover_path, "cover")
    stego_asset = ensure_audio_asset(stego_path, "group_part" if grouped else "stego")
    stego_props = get_wav_props(stego_path)
    cover_props = get_wav_props(cover_path)
    generation_id = f"gen_{uuid.uuid4().hex[:12]}"

    db.execute(
        """
        INSERT INTO stego_generations (
            generation_id, cover_asset_id, stego_asset_id, transmission_id, part_number, total_parts,
            encoder_model_name, encoder_version, payload_type, payload_bits, payload_chars,
            sample_rate, duration_seconds, cover_duration_seconds, stego_duration_seconds,
            cover_num_samples, stego_num_samples, chunk_count, carrier_chunk_duration_seconds,
            is_grouped, group_role, parent_message_id, source_chat_message_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            generation_id,
            cover_asset["asset_id"],
            stego_asset["asset_id"],
            transmission_id,
            part_number,
            total_parts,
            "aura_v2r_sender",
            "v1",
            "text",
            payload_bits,
            payload_chars,
            stego_props.get("sample_rate"),
            stego_props.get("audio_duration_sec"),
            cover_props.get("audio_duration_sec"),
            stego_props.get("audio_duration_sec"),
            cover_asset.get("num_samples"),
            stego_asset.get("num_samples"),
            chunk_count,
            chunk_seconds,
            1 if grouped else 0,
            "group_part" if grouped else "single",
            parent_message_id,
            parent_message_id,
        ),
    )
    if transmission_id and grouped and part_number is not None and total_parts is not None:
        db.execute(
            """
            INSERT OR REPLACE INTO transmission_parts
            (transmission_id, part_number, total_parts, cover_asset_id, stego_asset_id, file_path, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                transmission_id,
                part_number,
                total_parts,
                cover_asset["asset_id"],
                stego_asset["asset_id"],
                relative_audio_path(stego_path),
                "generated",
            ),
        )
    db.commit()
    return {
        "generation_id": generation_id,
        "cover_asset_id": cover_asset["asset_id"],
        "stego_asset_id": stego_asset["asset_id"],
        "cover_audio_path": cover_asset["file_path"],
        "stego_audio_path": stego_asset["file_path"],
        "cover_audio_hash": cover_asset["file_hash"],
        "stego_audio_hash": stego_asset["file_hash"],
    }


def capacity_for_text(text: str) -> dict[str, Any]:
    plan = build_encode_transmission_plan(text)
    first_segment = plan["segments"][0] if plan["segments"] else None
    carrier_name = first_segment["carrierName"] if first_segment else ""
    carrier_path = CARRIER_DIR / carrier_name if carrier_name else None
    return {
        "success": True,
        "message_length": plan["messageChars"],
        "header_bytes": HEADER_BYTES,
        "header_nibbles": HEADER_NIBBLES,
        "header_chunks": None,
        "payload_nibbles": plan["messageBytes"] * 2,
        "payload_chunks": None,
        "required_chunks": plan["requiredChunks"],
        "required_seconds": plan["requiredSeconds"],
        "required_minutes": plan["requiredMinutes"],
        "mode": "safe_dynamic",
        "carrier_alias": alias_for_carrier(carrier_path) if carrier_path else "N/A",
        "carrier_path": str(carrier_path.relative_to(BASE_DIR)) if carrier_path else "",
        "carrier_duration_sec": first_segment["carrierDurationSec"] if first_segment else 0,
        "safe_status": "unsafe" if plan["mode"] == "exceeded" else "safe",
        "plan": plan,
    }


def select_safe_carrier(required_seconds: float) -> tuple[Path, float]:
    candidates: list[tuple[float, Path]] = []
    for name in APPROVED_SAFE_CARRIERS:
        path = CARRIER_DIR / name
        if path.exists():
            candidates.append((get_wav_duration_seconds(path), path))
    candidates.sort(key=lambda item: item[0])

    for duration, path in candidates:
        if duration + 1e-6 >= required_seconds:
            return path, duration

    raise RuntimeError(
        f"No approved safe carrier is long enough. Required {required_seconds:.2f}s."
    )


def alias_for_carrier(path: Path) -> str:
    match = re.search(r"carrier_(\d+)_", path.name)
    if not match:
        return "Voice Cover"
    return f"Voice Cover A{int(match.group(1)):02d}"


def normalize_ascii_text(text: str) -> str:
    return "".join(chr(ord(ch) & 0x7F) for ch in text)


def load_approved_carriers() -> list[dict[str, Any]]:
    cfg = load_cfg()
    repeat_factor = int(cfg["repeat_factor"])
    chunks_per_char = int(cfg["chunks_per_char_protected"])
    chunk_seconds = float(cfg["chunk_seconds"])
    header_chunks = HEADER_NIBBLES * repeat_factor

    carriers: list[dict[str, Any]] = []
    for name in APPROVED_SAFE_CARRIERS:
        wav_path = CARRIER_DIR / name
        if not wav_path.exists():
            continue
        duration = get_wav_duration_seconds(wav_path)
        total_chunks = int(duration // chunk_seconds)
        usable_payload_bytes = max(0, (total_chunks - header_chunks) // chunks_per_char)
        carriers.append(
            {
                "carrier_id": wav_path.stem,
                "carrier_name": name,
                "carrier_duration_sec": round(duration, 2),
                "usable_payload_bytes": int(usable_payload_bytes),
            }
        )
    carriers.sort(key=lambda carrier: carrier["carrier_duration_sec"])
    if not carriers:
        raise RuntimeError("No approved carriers found in carrier bank.")
    return carriers


def build_encode_transmission_plan(text: str) -> dict[str, Any]:
    normalized = normalize_ascii_text(text or "")
    message_bytes = normalized.encode("latin-1")
    cfg = load_cfg()
    carriers = load_approved_carriers()
    chunks_per_char = int(cfg["chunks_per_char_protected"])
    chunk_seconds = float(cfg["chunk_seconds"])
    header_chunks = HEADER_NIBBLES * int(cfg["repeat_factor"])
    message_chars = len(normalized)
    message_byte_count = len(message_bytes)

    smallest_single = next(
        (carrier for carrier in carriers if message_byte_count <= carrier["usable_payload_bytes"]),
        None,
    )
    if smallest_single is not None:
        required_chunks = header_chunks + (message_byte_count * chunks_per_char)
        required_seconds = required_chunks * chunk_seconds
        segment = {
            "segmentIndex": 0,
            "carrierId": smallest_single["carrier_id"],
            "carrierName": smallest_single["carrier_name"],
            "carrierDurationSec": smallest_single["carrier_duration_sec"],
            "carrierDurationMin": round(smallest_single["carrier_duration_sec"] / 60.0, 2),
            "usablePayloadBytes": smallest_single["usable_payload_bytes"],
            "assignedPayloadBytes": message_byte_count,
            "estimatedChunks": required_chunks,
            "estimatedSeconds": round(required_seconds, 2),
        }
        return {
            "mode": "single",
            "carrierReuseEnabled": False,
            "messageChars": message_chars,
            "messageBytes": message_byte_count,
            "requiredChunks": required_chunks,
            "requiredSeconds": round(required_seconds, 2),
            "requiredMinutes": round(required_seconds / 60.0, 2),
            "singleCarrierCandidate": {
                "carrierId": smallest_single["carrier_id"],
                "carrierName": smallest_single["carrier_name"],
                "carrierDurationSec": smallest_single["carrier_duration_sec"],
                "carrierDurationMin": round(smallest_single["carrier_duration_sec"] / 60.0, 2),
                "usablePayloadBytes": smallest_single["usable_payload_bytes"],
            },
            "segments": [segment],
            "uniqueCarriersUsed": 1,
            "reusedCarrierCount": 0,
            "totalSegments": 1,
            "totalAssignedPayloadBytes": message_byte_count,
            "totalAvailablePayloadBytes": smallest_single["usable_payload_bytes"],
            "totalDurationSec": smallest_single["carrier_duration_sec"],
            "totalDurationMin": round(smallest_single["carrier_duration_sec"] / 60.0, 2),
            "poolExceeded": False,
        }

    carriers_desc = sorted(
        (carrier for carrier in carriers if int(carrier["usable_payload_bytes"]) > 0),
        key=lambda carrier: (-int(carrier["usable_payload_bytes"]), str(carrier["carrier_name"])),
    )
    if not carriers_desc:
        raise RuntimeError("No approved carriers have usable payload capacity.")

    remaining = message_byte_count
    segments: list[dict[str, Any]] = []
    required_chunks = 0
    required_seconds = 0.0
    assigned_bytes = 0
    available_payload = 0
    carrier_index = 0
    hit_segment_cap = False
    hit_duration_cap = False

    while remaining > 0:
        if len(segments) >= MAX_REUSABLE_SEGMENTS:
            hit_segment_cap = True
            break

        carrier = carriers_desc[carrier_index % len(carriers_desc)]
        carrier_index += 1
        assign = min(remaining, int(carrier["usable_payload_bytes"]))
        segment_chunks = header_chunks + (assign * chunks_per_char)
        segment_seconds = segment_chunks * chunk_seconds
        projected_seconds = required_seconds + segment_seconds
        if (projected_seconds / 60.0) > MAX_TOTAL_TRANSMISSION_MINUTES + 1e-9:
            hit_duration_cap = True
            break

        segments.append(
            {
                "segmentIndex": len(segments),
                "carrierId": carrier["carrier_id"],
                "carrierName": carrier["carrier_name"],
                "carrierDurationSec": carrier["carrier_duration_sec"],
                "carrierDurationMin": round(carrier["carrier_duration_sec"] / 60.0, 2),
                "usablePayloadBytes": carrier["usable_payload_bytes"],
                "assignedPayloadBytes": assign,
                "estimatedChunks": segment_chunks,
                "estimatedSeconds": round(segment_seconds, 2),
            }
        )
        remaining -= assign
        assigned_bytes += assign
        required_chunks += segment_chunks
        required_seconds = projected_seconds
        available_payload += carrier["usable_payload_bytes"]

    unique_carriers_used = len({segment["carrierId"] for segment in segments})
    reused_carrier_count = len(segments) - unique_carriers_used
    if remaining == 0:
        return {
            "mode": "multi",
            "carrierReuseEnabled": True,
            "messageChars": message_chars,
            "messageBytes": message_byte_count,
            "requiredChunks": required_chunks,
            "requiredSeconds": round(required_seconds, 2),
            "requiredMinutes": round(required_seconds / 60.0, 2),
            "singleCarrierCandidate": None,
            "segments": segments,
            "uniqueCarriersUsed": unique_carriers_used,
            "reusedCarrierCount": reused_carrier_count,
            "totalSegments": len(segments),
            "totalAssignedPayloadBytes": assigned_bytes,
            "totalAvailablePayloadBytes": available_payload,
            "totalDurationSec": round(sum(segment["carrierDurationSec"] for segment in segments), 2),
            "totalDurationMin": round(sum(segment["carrierDurationSec"] for segment in segments) / 60.0, 2),
            "poolExceeded": False,
        }

    return {
        "mode": "exceeded",
        "carrierReuseEnabled": True,
        "messageChars": message_chars,
        "messageBytes": message_byte_count,
        "requiredChunks": required_chunks,
        "requiredSeconds": round(required_seconds, 2),
        "requiredMinutes": round(required_seconds / 60.0, 2),
        "singleCarrierCandidate": None,
        "segments": segments,
        "uniqueCarriersUsed": unique_carriers_used,
        "reusedCarrierCount": reused_carrier_count,
        "totalSegments": len(segments),
        "totalAssignedPayloadBytes": assigned_bytes,
        "totalAvailablePayloadBytes": available_payload,
        "totalDurationSec": round(sum(segment["carrierDurationSec"] for segment in segments), 2),
        "totalDurationMin": round(sum(segment["carrierDurationSec"] for segment in segments) / 60.0, 2),
        "poolExceeded": True,
        "exceededReason": "segment_cap" if hit_segment_cap else "duration_cap" if hit_duration_cap else "capacity_cap",
    }


def run_sender_with_cover(text: str, out_path: Path, cover_path: Path) -> str:
    command = [
        sys.executable,
        str(SENDER_SCRIPT),
        "--config",
        str(CONFIG_FILE),
        "--cover",
        str(cover_path),
        "--text",
        text,
        "--out",
        str(out_path),
    ]
    completed = subprocess.run(
        command,
        cwd=str(MODEL_DIR),
        capture_output=True,
        text=True,
        timeout=300,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or completed.stdout.strip())
    return completed.stdout


def parse_transmission_filename(name: str) -> dict[str, Any] | None:
    match = TX_FILE_RE.match(name or "")
    if not match:
        return None
    transmission_id, part, total = match.groups()
    segment_index = max(0, int(part) - 1)
    total_segments = int(total)
    if total_segments <= 0:
        return None
    if segment_index >= total_segments:
        return None
    return {
        "transmission_id": transmission_id.lower(),
        "segment_index": segment_index,
        "total_segments": total_segments,
    }


def encode_text(text: str) -> dict[str, Any]:
    ensure_dirs()
    plan = build_encode_transmission_plan(text)
    if plan["mode"] == "exceeded":
        raise RuntimeError("This message exceeds Aura's current safe transmission limit.")
    normalized = normalize_ascii_text(text)
    message_bytes = normalized.encode("latin-1")
    sender_stdout_log: list[str] = []

    if plan["mode"] == "single":
        segment = plan["segments"][0]
        message_id = f"msg_{uuid.uuid4().hex[:10]}"
        file_name = f"{message_id}.wav"
        out_path = OUTPUT_DIR / file_name
        cover_path = CARRIER_DIR / segment["carrierName"]
        sender_stdout = run_sender_with_cover(normalized, out_path, cover_path)
        sender_stdout_log.append(sender_stdout)
        cfg = load_cfg()
        provenance = save_generation_provenance(
            cover_path=cover_path,
            stego_path=out_path,
            transmission_id=None,
            part_number=1,
            total_parts=1,
            payload_chars=len(normalized),
            payload_bits=len(message_bytes) * 8,
            chunk_count=segment["estimatedChunks"],
            chunk_seconds=float(cfg["chunk_seconds"]),
            parent_message_id=message_id,
            grouped=False,
        )
        result = {
            **capacity_for_text(text),
            "success": True,
            "mode": "single",
            "message_id": message_id,
            "audio_url": f"/outputs/{file_name}",
            "file_name": file_name,
            "protection": "length_header_repeat3",
            "sender_stdout": sender_stdout,
            "segments": [
                {
                    "segment_index": 0,
                    "carrier_id": segment["carrierId"],
                    "carrier_name": segment["carrierName"],
                    "carrier_duration_sec": segment["carrierDurationSec"],
                    "payload_bytes": segment["assignedPayloadBytes"],
                    "stego_file_name": file_name,
                    "audio_url": f"/outputs/{file_name}",
                    **provenance,
                }
            ],
            "total_segments": 1,
            "provenance": {
                "grouped": False,
                "assets": [
                    {
                        "partNumber": 1,
                        "coverAudioPath": provenance["cover_audio_path"],
                        "stegoAudioPath": provenance["stego_audio_path"],
                        "coverAssetId": provenance["cover_asset_id"],
                        "stegoAssetId": provenance["stego_asset_id"],
                    }
                ],
            },
        }
        save_encode_record(message_id, result)
        return result

    transmission_id = f"{secrets.randbits(64):016x}"
    cfg = load_cfg()
    db = get_db()
    db.execute(
        """
        INSERT OR REPLACE INTO transmissions (transmission_id, total_parts, status, payload_preview, completed_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        """,
        (transmission_id, len(plan["segments"]), "generated", normalized[:120]),
    )
    db.commit()

    segments: list[dict[str, Any]] = []
    offset = 0
    for idx, planned in enumerate(plan["segments"]):
        assigned = int(planned["assignedPayloadBytes"])
        payload = message_bytes[offset : offset + assigned]
        offset += assigned
        part = idx + 1
        total = len(plan["segments"])
        file_name = f"tx_{transmission_id}_part_{part:02d}_of_{total:02d}.wav"
        out_path = OUTPUT_DIR / file_name
        cover_path = CARRIER_DIR / planned["carrierName"]
        sender_stdout = run_sender_with_cover(payload.decode("latin-1"), out_path, cover_path)
        sender_stdout_log.append(sender_stdout)
        provenance = save_generation_provenance(
            cover_path=cover_path,
            stego_path=out_path,
            transmission_id=transmission_id,
            part_number=part,
            total_parts=total,
            payload_chars=len(payload.decode("latin-1")),
            payload_bits=len(payload) * 8,
            chunk_count=planned["estimatedChunks"],
            chunk_seconds=float(cfg["chunk_seconds"]),
            parent_message_id=f"tx_{transmission_id}",
            grouped=True,
        )
        segments.append(
            {
                "segment_index": idx,
                "carrier_id": planned["carrierId"],
                "carrier_name": planned["carrierName"],
                "carrier_duration_sec": planned["carrierDurationSec"],
                "payload_bytes": assigned,
                "stego_file_name": file_name,
                "audio_url": f"/outputs/{file_name}",
                **provenance,
            }
        )

    manifest = {
        "transmission_id": transmission_id,
        "mode": "multi",
        "version": 1,
        "original_message_chars": len(normalized),
        "original_message_bytes": len(message_bytes),
        "total_segments": len(segments),
        "total_duration_sec": round(sum(seg["carrier_duration_sec"] for seg in segments), 2),
        "segments": segments,
    }
    manifest_name = f"tx_{transmission_id}_manifest.json"
    (OUTPUT_DIR / manifest_name).write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    first_file = segments[0]["stego_file_name"]
    message_id = f"tx_{transmission_id}"
    result = {
        **capacity_for_text(text),
        "success": True,
        "mode": "multi",
        "transmission_id": transmission_id,
        "total_segments": len(segments),
        "segments": segments,
        "manifest": manifest,
        "manifest_file_name": manifest_name,
        "message_id": message_id,
        "audio_url": f"/outputs/{first_file}",
        "file_name": first_file,
        "protection": "length_header_repeat3",
        "sender_stdout": "\n\n".join(sender_stdout_log),
        "carrier_path": str(CARRIER_DIR / segments[0]["carrier_name"]),
        "carrier_alias": alias_for_carrier(CARRIER_DIR / segments[0]["carrier_name"]),
        "carrier_duration_sec": segments[0]["carrier_duration_sec"],
        "safe_status": "safe",
        "provenance": {
            "grouped": True,
            "transmissionId": transmission_id,
            "assets": [
                {
                    "partNumber": segment["segment_index"] + 1,
                    "coverAudioPath": segment.get("cover_audio_path"),
                    "stegoAudioPath": segment.get("stego_audio_path"),
                    "coverAssetId": segment.get("cover_asset_id"),
                    "stegoAssetId": segment.get("stego_asset_id"),
                }
                for segment in segments
            ],
        },
    }
    save_encode_record(message_id, result)
    return result


def decode_audio_path(path: Path, message_id: str | None = None, timeout_seconds: float = 300) -> dict[str, Any]:
    ensure_dirs()
    cfg = load_cfg()
    if message_id is None:
        message_id = path.stem

    command = [
        sys.executable,
        str(RECEIVER_SCRIPT),
        "--config",
        str(CONFIG_FILE),
        "--weights",
        str(WEIGHTS_FILE),
        "--stego",
        str(path),
    ]
    completed = subprocess.run(
        command,
        cwd=str(MODEL_DIR),
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or completed.stdout.strip())

    parsed = parse_receiver_stdout(completed.stdout)
    props = get_wav_props(path)
    total_chunks = int(props["audio_duration_sec"] // float(cfg["chunk_seconds"]))

    result = {
        "success": True,
        "message_id": message_id,
        "audio_url": f"/outputs/{path.name}" if path.parent == OUTPUT_DIR else "",
        "file_name": path.name,
        **props,
        "total_chunks": parsed.get("total_chunks", total_chunks),
        "header_chunks": parsed.get("header_chunks", HEADER_NIBBLES * cfg["repeat_factor"]),
        "header_voted_nibbles": parsed.get("header_voted_nibbles", HEADER_NIBBLES),
        "decoded_message_length": parsed.get("decoded_message_length", 0),
        "payload_chunks_needed": parsed.get("payload_chunks_needed", 0),
        "total_needed_chunks": parsed.get("total_needed_chunks", 0),
        "ignored_tail_chunks": parsed.get("ignored_tail_chunks", 0),
        "header_valid": True,
        "raw_text": parsed.get("raw_text", ""),
        "corrected_text": parsed.get("corrected_text", ""),
        "changes": parsed.get("changes", []),
        "recovery_status": recovery_status(
            parsed.get("raw_text", ""),
            parsed.get("corrected_text", ""),
            parsed.get("changes", []),
        ),
        "receiver_stdout": completed.stdout,
    }
    save_decode_record(message_id, result)
    return result


def decode_audio_paths(paths: list[Path], per_file_timeout_seconds: float = 300) -> dict[str, Any]:
    return recover_grouped_transmission(paths, per_file_timeout_seconds=per_file_timeout_seconds)


def parse_receiver_stdout(output: str) -> dict[str, Any]:
    def int_after(label: str) -> int | None:
        match = re.search(rf"{re.escape(label)}\s*:\s*(\d+)", output)
        return int(match.group(1)) if match else None

    raw_text = block_between(output, "RAW DECODED TEXT:", "-" * 20)
    corrected_text = block_between(output, "CORRECTED TEXT:", "-" * 20)
    changes_block = block_between(output, "CHANGED WORDS:", "-" * 20)
    changes = []
    for line in changes_block.splitlines():
        if "->" in line:
            left, right = line.split("->", 1)
            changes.append(
                {
                    "from": left.strip(),
                    "to": right.strip(),
                    "type": "postprocess_correction",
                }
            )

    return {
        "total_chunks": int_after("Total chunks in file"),
        "header_chunks": int_after("Header chunks"),
        "header_voted_nibbles": int_after("Header voted nibbles"),
        "decoded_message_length": int_after("Decoded msg length"),
        "payload_chunks_needed": int_after("Payload chunks needed"),
        "total_needed_chunks": int_after("Total needed chunks"),
        "ignored_tail_chunks": int_after("Ignored tail chunks"),
        "raw_text": raw_text.strip(),
        "corrected_text": corrected_text.strip(),
        "changes": changes,
    }


def block_between(output: str, start: str, end_prefix: str) -> str:
    if start not in output:
        return ""
    after = output.split(start, 1)[1].lstrip("\r\n")
    lines = []
    for line in after.splitlines():
        if line.startswith(end_prefix):
            break
        lines.append(line)
    return "\n".join(lines)


def recovery_status(
    raw_text: str,
    corrected_text: str,
    changes: list[dict[str, Any]],
) -> str:
    raw_text = (raw_text or "").strip()
    corrected_text = (corrected_text or "").strip()

    if changes:
        return "minor_corrected"

    if raw_text != corrected_text:
        return "minor_corrected"

    return "decoded_uncorrected"


def load_messages() -> list[dict[str, Any]]:
    ensure_dirs()
    if not MESSAGE_STORE.exists():
        return []
    return json.loads(MESSAGE_STORE.read_text(encoding="utf-8"))


def save_messages(messages: list[dict[str, Any]]) -> None:
    ensure_dirs()
    MESSAGE_STORE.write_text(json.dumps(messages, indent=2), encoding="utf-8")


def add_message(payload: dict[str, Any]) -> dict[str, Any]:
    messages = load_messages()
    message = {
        "id": f"chat_{uuid.uuid4().hex[:10]}",
        "createdAt": payload.get("createdAt"),
        **payload,
    }
    messages.append(message)
    save_messages(messages)
    return message


def save_encode_record(message_id: str, result: dict[str, Any]) -> None:
    records = load_records()
    records.setdefault(message_id, {})["encode"] = result
    save_records(records)


def save_decode_record(message_id: str, result: dict[str, Any]) -> None:
    records = load_records()
    records.setdefault(message_id, {})["decode"] = result
    save_records(records)


def load_records() -> dict[str, Any]:
    path = BASE_DIR / "instance" / "aura_records.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def save_records(records: dict[str, Any]) -> None:
    path = BASE_DIR / "instance" / "aura_records.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(records, indent=2), encoding="utf-8")


def get_existing_reveal_for_target(message_id: str | None = None, transmission_id: str | None = None) -> dict[str, Any] | None:
    records = load_records()
    if transmission_id:
        target_id = f"tx_{transmission_id}"
        record = records.get(target_id, {})
        decode = record.get("decode")
        if decode:
            return decode
    if message_id:
        record = records.get(message_id, {})
        decode = record.get("decode")
        if decode:
            return decode
    return None


def recover_grouped_transmission(
    paths: list[Path],
    transmission_id: str | None = None,
    persist: bool = True,
    per_file_timeout_seconds: float = 300,
) -> dict[str, Any]:
    if not paths:
        raise RuntimeError("No audio files provided for grouped recovery.")
    if len(paths) == 1:
        return decode_audio_path(paths[0], message_id=paths[0].stem, timeout_seconds=per_file_timeout_seconds)

    parsed_files: list[tuple[Path, str, int, int]] = []
    for path in paths:
        parsed = parse_transmission_filename(path.name)
        if parsed is None:
            return {
                "success": False,
                "mode": "multi",
                "recovery_status": "incomplete",
                "error": f"Malformed segment metadata for file: {path.name}",
                "recovered_text": None,
            }
        parsed_files.append((path, parsed["transmission_id"], parsed["segment_index"], parsed["total_segments"]))

    tx_ids = {tx for _, tx, _, _ in parsed_files}
    if len(tx_ids) != 1:
        return {
            "success": False,
            "mode": "multi",
            "recovery_status": "incomplete",
            "error": "These files do not belong to the same Aura transmission.",
            "recovered_text": None,
        }
    resolved_tx_id = transmission_id or next(iter(tx_ids))
    totals = {total for _, _, _, total in parsed_files}
    if len(totals) != 1:
        return {
            "success": False,
            "mode": "multi",
            "transmission_id": resolved_tx_id,
            "recovery_status": "incomplete",
            "error": "Total segment count mismatch across files.",
            "recovered_text": None,
        }
    total_segments = next(iter(totals))
    by_index: dict[int, Path] = {}
    duplicates: list[int] = []
    for path, _tx, seg_idx, _total in parsed_files:
        if seg_idx in by_index:
            duplicates.append(seg_idx)
        else:
            by_index[seg_idx] = path
    if duplicates:
        dup = duplicates[0] + 1
        return {
            "success": False,
            "mode": "multi",
            "transmission_id": resolved_tx_id,
            "total_segments": total_segments,
            "received_segments": len(by_index),
            "missing_segments": [idx + 1 for idx in range(total_segments) if idx not in by_index],
            "recovery_status": "incomplete",
            "error": f"Duplicate Part {dup} detected.",
            "recovered_text": None,
        }
    missing = [idx for idx in range(total_segments) if idx not in by_index]
    if missing:
        return {
            "success": False,
            "mode": "multi",
            "transmission_id": resolved_tx_id,
            "total_segments": total_segments,
            "received_segments": len(by_index),
            "missing_segments": [idx + 1 for idx in missing],
            "recovery_status": "incomplete",
            "error": f"Missing segment(s): {len(by_index)} of {total_segments}",
            "recovered_text": None,
        }

    ordered_segments: list[dict[str, Any]] = []
    recovered_parts: list[str] = []
    failed_segments: list[int] = []
    combined_changes: list[dict[str, Any]] = []
    total_chunks = 0
    payload_chunks_needed = 0
    ignored_tail_chunks = 0
    header_valid = True

    for idx in range(total_segments):
        path = by_index[idx]
        try:
            decoded = decode_audio_path(
                path,
                message_id=f"tx_{resolved_tx_id}_part_{idx+1:02d}",
                timeout_seconds=per_file_timeout_seconds,
            )
            part_text = decoded.get("corrected_text") or decoded.get("raw_text") or ""
            recovered_parts.append(part_text)
            combined_changes.extend(decoded.get("changes", []))
            total_chunks += int(decoded.get("total_chunks") or 0)
            payload_chunks_needed += int(decoded.get("payload_chunks_needed") or 0)
            ignored_tail_chunks += int(decoded.get("ignored_tail_chunks") or 0)
            header_valid = header_valid and bool(decoded.get("header_valid", True))
            ordered_segments.append(
                {
                    "segment_index": idx,
                    "file_name": path.name,
                    "audio_url": f"/outputs/{path.name}" if path.parent == OUTPUT_DIR else "",
                    "status": "decoded",
                    "decoded_text": part_text,
                }
            )
        except Exception as exc:
            failed_segments.append(idx)
            ordered_segments.append(
                {
                    "segment_index": idx,
                    "file_name": path.name,
                    "audio_url": f"/outputs/{path.name}" if path.parent == OUTPUT_DIR else "",
                    "status": "failed",
                    "decoded_text": "",
                    "error": str(exc),
                }
            )

    if failed_segments:
        result = {
            "success": False,
            "mode": "multi",
            "transmission_id": resolved_tx_id,
            "total_segments": total_segments,
            "received_segments": total_segments - len(failed_segments),
            "missing_segments": [idx + 1 for idx in failed_segments],
            "segments": ordered_segments,
            "recovery_status": "incomplete",
            "recovered_text": None,
            "error": f"Missing segment(s): {total_segments - len(failed_segments)} of {total_segments}",
            "changes": combined_changes,
        }
    else:
        recovered_text = "".join(recovered_parts)
        result = {
            "success": True,
            "mode": "multi",
            "transmission_id": resolved_tx_id,
            "total_segments": total_segments,
            "received_segments": total_segments,
            "missing_segments": [],
            "segments": ordered_segments,
            "recovered_text": recovered_text,
            "recovery_status": "complete",
            "corrected_text": recovered_text,
            "raw_text": recovered_text,
            "changes": combined_changes,
            "header_valid": header_valid,
            "total_chunks": total_chunks,
            "payload_chunks_needed": payload_chunks_needed,
            "ignored_tail_chunks": ignored_tail_chunks,
        }

    if persist and resolved_tx_id:
        save_decode_record(f"tx_{resolved_tx_id}", result)

    return result


def clamp_score(value: float, minimum: float = 0.0, maximum: float = 100.0) -> float:
    return round(max(minimum, min(maximum, value)), 2)


def chunk_audio(samples: list[float], sample_rate: int, chunk_seconds: float) -> list[list[float]]:
    if not samples or sample_rate <= 0:
        return []
    chunk_size = max(1, int(sample_rate * chunk_seconds))
    return [samples[index : index + chunk_size] for index in range(0, len(samples), chunk_size) if samples[index : index + chunk_size]]


def mean_squared_error(left: list[float], right: list[float]) -> float | None:
    count = min(len(left), len(right))
    if count <= 0:
        return None
    return sum((left[i] - right[i]) ** 2 for i in range(count)) / count


def signal_to_noise_ratio(left: list[float], right: list[float]) -> float | None:
    count = min(len(left), len(right))
    if count <= 0:
        return None
    signal_power = sum(left[i] * left[i] for i in range(count)) / count
    noise_power = sum((left[i] - right[i]) ** 2 for i in range(count)) / count
    if signal_power <= 1e-12:
        return None
    if noise_power <= 1e-12:
        return 80.0
    return 10.0 * math.log10(signal_power / noise_power)


def mean_absolute_error(left: list[float], right: list[float]) -> float | None:
    count = min(len(left), len(right))
    if count <= 0:
        return None
    return sum(abs(left[i] - right[i]) for i in range(count)) / count


def spectrogram_delta_score(left_samples: list[float], right_samples: list[float]) -> float | None:
    left = build_spectrogram(left_samples, 48, 24)["values"]
    right = build_spectrogram(right_samples, 48, 24)["values"]
    if not left or not right:
        return None
    total = 0.0
    count = 0
    for row_index in range(min(len(left), len(right))):
        for col_index in range(min(len(left[row_index]), len(right[row_index]))):
            total += abs(left[row_index][col_index] - right[row_index][col_index])
            count += 1
    if count <= 0:
        return None
    return total / count


def spectrogram_to_svg(values: list[list[float]], title: str) -> str:
    width = 640
    height = 220
    margin_top = 20
    rows = len(values)
    cols = len(values[0]) if rows else 0
    cell_w = width / max(1, cols)
    cell_h = (height - margin_top) / max(1, rows)
    rects: list[str] = []
    for row_index, row in enumerate(values):
        for col_index, value in enumerate(row):
            intensity = max(0.0, min(1.0, float(value)))
            r = int(24 + 90 * intensity)
            g = int(32 + 165 * intensity)
            b = int(36 + 160 * intensity)
            opacity = 0.18 + 0.82 * intensity
            rects.append(
                f'<rect x="{col_index * cell_w:.2f}" y="{margin_top + row_index * cell_h:.2f}" '
                f'width="{cell_w + 0.5:.2f}" height="{cell_h + 0.5:.2f}" '
                f'fill="rgb({r},{g},{b})" fill-opacity="{opacity:.3f}" />'
            )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
        f'<rect width="{width}" height="{height}" rx="16" fill="rgb(18,22,24)" />'
        f'<text x="18" y="14" fill="rgb(176,190,194)" font-size="11" font-family="Arial, sans-serif">{title}</text>'
        + "".join(rects)
        + "</svg>"
    )


def write_analysis_svg(path: Path, values: list[list[float]], title: str) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(spectrogram_to_svg(values, title), encoding="utf-8")
    return f"/outputs/{path.relative_to(OUTPUT_DIR).as_posix()}"


def build_waveform_points(samples: list[float], points: int = 240) -> list[dict[str, float]]:
    return [{"x": float(index), "y": float(value)} for index, value in enumerate(downsample_series(samples, points))]


def resolve_analysis_source(message_id: str) -> dict[str, Any]:
    records = load_records()
    record = records.get(message_id, {})
    encode = record.get("encode") or None
    decode = record.get("decode") or None
    upload_transfer = None

    if encode:
        if encode.get("mode") == "multi":
            segments = encode.get("segments") or []
            segment_files = [OUTPUT_DIR / segment.get("stego_file_name", "") for segment in segments]
            existing_paths = [path for path in segment_files if path.exists()]
            missing_paths = [path for path in segment_files if not path.exists()]
            effective_mode = "single" if len(segment_files) == 1 else "grouped"
            return {
                "message_id": message_id,
                "mode": effective_mode,
                "record": record,
                "encode": encode,
                "decode": decode,
                "audio_paths": existing_paths,
                "expected_audio_paths": segment_files,
                "missing_audio_paths": missing_paths,
                "files_total": len(segment_files),
                "source": "generated",
                "upload_transfer": None,
            }

        single_path = OUTPUT_DIR / encode.get("file_name", "")
        return {
            "message_id": message_id,
            "mode": "single",
            "record": record,
            "encode": encode,
            "decode": decode,
            "audio_paths": [single_path] if single_path.exists() else [],
            "expected_audio_paths": [single_path],
            "missing_audio_paths": [] if single_path.exists() else [single_path],
            "files_total": 1,
            "source": "generated",
            "upload_transfer": None,
        }

    if message_id.isdigit():
        upload_transfer = get_db().execute(
            """
            SELECT original_filename, stored_filename, file_size
            FROM audio_transfers
            WHERE id = ?
            """,
            (int(message_id),),
        ).fetchone()
        if upload_transfer is not None:
            audio_path = UPLOAD_DIR / upload_transfer["stored_filename"]
            return {
                "message_id": message_id,
                "mode": "single",
                "record": record,
                "encode": None,
                "decode": decode,
                "audio_paths": [audio_path] if audio_path.exists() else [],
                "expected_audio_paths": [audio_path],
                "missing_audio_paths": [] if audio_path.exists() else [audio_path],
                "files_total": 1,
                "source": "uploaded",
                "upload_transfer": upload_transfer,
            }

    fallback = OUTPUT_DIR / f"{message_id}.wav"
    return {
        "message_id": message_id,
        "mode": "single",
        "record": record,
        "encode": encode,
        "decode": decode,
        "audio_paths": [fallback] if fallback.exists() else [],
        "expected_audio_paths": [fallback],
        "missing_audio_paths": [] if fallback.exists() else [fallback],
        "files_total": 1,
        "source": "generated" if fallback.exists() else "uploaded",
        "upload_transfer": upload_transfer,
    }


def resolve_grouped_analysis_source(
    *,
    transmission_id: str,
    total_segments: int,
    message_id: str | None = None,
    selected_part_number: int | None = None,
    selected_part_filename: str | None = None,
) -> dict[str, Any]:
    records = load_records()
    grouped_message_id = f"tx_{transmission_id}"
    record = records.get(grouped_message_id) or records.get(message_id or "") or {}
    encode = record.get("encode") or None
    decode = record.get("decode") or None

    segment_files: list[Path] = []
    if encode and encode.get("mode") == "multi":
        def segment_index_for(segment: dict[str, Any], fallback: int) -> int:
            value = segment.get("segmentIndex")
            if value is None:
                value = segment.get("segment_index")
            if value is None:
                return fallback
            return int(value)

        segments = sorted(
            encode.get("segments") or [],
            key=lambda segment: segment_index_for(segment, 0),
        )

        for index in range(total_segments):
            matching_segment = next(
                (
                    segment
                    for segment in segments
                    if segment_index_for(segment, -1) == index
                ),
                None,
            )
            file_name = (
                (matching_segment or {}).get("stego_file_name")
                or (matching_segment or {}).get("fileName")
                or f"tx_{transmission_id}_part_{index + 1:02d}_of_{total_segments:02d}.wav"
            )
            segment_files.append(OUTPUT_DIR / Path(str(file_name)).name)
    else:
        segment_files = [
            OUTPUT_DIR / f"tx_{transmission_id}_part_{index + 1:02d}_of_{total_segments:02d}.wav"
            for index in range(total_segments)
        ]

    existing_paths = [path for path in segment_files if path.exists()]
    missing_paths = [path for path in segment_files if not path.exists()]

    print(
        f"[analysis] grouped resolve tx={transmission_id} "
        f"files={len(existing_paths)}/{total_segments} "
        f"selected={selected_part_number} missing={[path.name for path in missing_paths]}"
    )

    return {
        "message_id": grouped_message_id,
        "mode": "grouped" if total_segments > 1 else "single",
        "record": record,
        "encode": encode,
        "decode": decode,
        "audio_paths": existing_paths,
        "expected_audio_paths": segment_files,
        "missing_audio_paths": missing_paths,
        "files_total": total_segments,
        "source": "generated",
        "upload_transfer": None,
        "analysis_message_id": grouped_message_id,
        "transmission_id": transmission_id,
        "selected_part_number": selected_part_number,
        "selected_part_filename": selected_part_filename,
        "normalized_from_single_part_transmission": total_segments == 1,
    }


def load_generation_rows(message_id: str, encode: dict[str, Any] | None) -> list[dict[str, Any]]:
    db = get_db()
    if encode and encode.get("mode") == "multi" and encode.get("transmission_id"):
        rows = db.execute(
            """
            SELECT sg.*, ca.file_path AS cover_file_path, ca.file_hash AS cover_file_hash,
                   sa.file_path AS stego_file_path, sa.file_hash AS stego_file_hash
            FROM stego_generations sg
            JOIN audio_assets ca ON ca.asset_id = sg.cover_asset_id
            JOIN audio_assets sa ON sa.asset_id = sg.stego_asset_id
            WHERE sg.transmission_id = ?
            ORDER BY sg.part_number
            """,
            (encode["transmission_id"],),
        ).fetchall()
    else:
        rows = db.execute(
            """
            SELECT sg.*, ca.file_path AS cover_file_path, ca.file_hash AS cover_file_hash,
                   sa.file_path AS stego_file_path, sa.file_hash AS stego_file_hash
            FROM stego_generations sg
            JOIN audio_assets ca ON ca.asset_id = sg.cover_asset_id
            JOIN audio_assets sa ON sa.asset_id = sg.stego_asset_id
            WHERE sg.parent_message_id = ?
            ORDER BY COALESCE(sg.part_number, 1)
            """,
            (message_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def resolve_analysis_target(
    *,
    message_id: str | None = None,
    source_type: str | None = None,
    transmission_id: str | None = None,
    selected_part_number: int | None = None,
    selected_part_filename: str | None = None,
    audio_url: str | None = None,
    file_name: str | None = None,
    total_parts: int | None = None,
) -> dict[str, Any]:
    requested_name = selected_part_filename or file_name or Path(audio_url or "").name
    parsed_name = parse_transmission_filename(requested_name)
    is_single_part_transmission = bool(parsed_name and int(parsed_name.get("total_segments") or 0) == 1)
    parsed_total_segments = int((parsed_name or {}).get("total_segments") or total_parts or 0)

    resolved_transmission_id = None if is_single_part_transmission else transmission_id or (parsed_name or {}).get("transmission_id")
    resolved_selected_part = selected_part_number
    if resolved_selected_part is None and parsed_name is not None:
        resolved_selected_part = int(parsed_name["segment_index"]) + 1

    if resolved_transmission_id and parsed_total_segments > 1:
        return resolve_grouped_analysis_source(
            transmission_id=resolved_transmission_id,
            total_segments=parsed_total_segments,
            message_id=message_id,
            selected_part_number=resolved_selected_part,
            selected_part_filename=selected_part_filename or file_name or requested_name,
        )

    if isinstance(audio_url, str) and audio_url.startswith("/outputs/"):
        audio_path = OUTPUT_DIR / Path(audio_url).name
        record = load_records().get(message_id or "", {})
        return {
            "message_id": message_id,
            "mode": "single" if is_single_part_transmission else ("grouped" if source_type == "grouped" and not is_single_part_transmission else "single"),
            "record": record,
            "encode": record.get("encode"),
            "decode": record.get("decode"),
            "audio_paths": [audio_path] if audio_path.exists() else [],
            "expected_audio_paths": [audio_path],
            "missing_audio_paths": [] if audio_path.exists() else [audio_path],
            "files_total": 1,
            "source": "generated",
            "upload_transfer": None,
            "analysis_message_id": message_id or audio_path.stem,
            "transmission_id": None if is_single_part_transmission else resolved_transmission_id,
            "selected_part_number": resolved_selected_part,
            "selected_part_filename": selected_part_filename or file_name or audio_path.name,
            "normalized_from_single_part_transmission": is_single_part_transmission,
        }

    if source_type == "grouped" or resolved_transmission_id:
        grouped_message_id = (
            message_id
            if (message_id or "").startswith("tx_")
            else f"tx_{resolved_transmission_id}" if resolved_transmission_id else message_id
        )
        source = resolve_analysis_source(grouped_message_id or "")
        encode = source.get("encode") or {}
        if not resolved_transmission_id:
            resolved_transmission_id = encode.get("transmission_id")
        if source.get("files_total") == 1:
            source["mode"] = "single"
        return {
            **source,
            "mode": source.get("mode") or "grouped",
            "analysis_message_id": grouped_message_id or message_id,
            "transmission_id": resolved_transmission_id,
            "selected_part_number": resolved_selected_part,
            "selected_part_filename": selected_part_filename or file_name,
            "normalized_from_single_part_transmission": bool(source.get("files_total") == 1),
        }

    single_source = resolve_analysis_source(message_id or "")
    return {
        **single_source,
        "mode": "single",
        "analysis_message_id": message_id,
        "transmission_id": None,
        "selected_part_number": None,
        "selected_part_filename": selected_part_filename or file_name,
        "normalized_from_single_part_transmission": is_single_part_transmission,
    }


def build_compare_artifacts(
    analysis_id: str,
    generation_rows: list[dict[str, Any]],
    selected_part: int | None = None,
) -> dict[str, Any]:
    if not generation_rows:
        return {
            "available": False,
            "coverImageUrl": None,
            "stegoImageUrl": None,
            "diffImageUrl": None,
            "partOptions": [],
        }

    if selected_part is None:
        target = generation_rows[0]
    else:
        target = next((row for row in generation_rows if int(row.get("part_number") or 1) == selected_part), generation_rows[0])

    cover_path = BASE_DIR / target["cover_file_path"]
    stego_path = BASE_DIR / target["stego_file_path"]
    if not cover_path.exists() or not stego_path.exists():
        return {
            "available": False,
            "coverImageUrl": None,
            "stegoImageUrl": None,
            "diffImageUrl": None,
            "partOptions": [],
        }

    cache_key = f"{target.get('cover_file_hash','nocover')[:10]}_{target.get('stego_file_hash','nostego')[:10]}"
    artifact_dir = ANALYSIS_ARTIFACT_DIR / analysis_id
    prefix = f"part_{int(target.get('part_number') or 1):02d}_{cache_key}"

    cover_samples, _ = read_mono_samples(cover_path)
    stego_samples, _ = read_mono_samples(stego_path)
    compare_count = min(len(cover_samples), len(stego_samples))
    diff_samples = [stego_samples[i] - cover_samples[i] for i in range(compare_count)]

    cover_url = write_analysis_svg(
        artifact_dir / f"{prefix}_cover.svg",
        build_spectrogram(cover_samples, 56, 24)["values"],
        "Cover spectrogram",
    )
    stego_url = write_analysis_svg(
        artifact_dir / f"{prefix}_stego.svg",
        build_spectrogram(stego_samples, 56, 24)["values"],
        "Stego spectrogram",
    )
    diff_url = write_analysis_svg(
        artifact_dir / f"{prefix}_diff.svg",
        build_spectrogram(diff_samples, 56, 24)["values"],
        "Residual spectrogram",
    )

    return {
        "available": True,
        "coverImageUrl": cover_url,
        "stegoImageUrl": stego_url,
        "diffImageUrl": diff_url,
        "selectedPart": int(target.get("part_number") or 1),
        "partOptions": [int(row.get("part_number") or 1) for row in generation_rows],
    }


def build_chunk_metrics_for_path(
    *,
    part_number: int,
    stego_path: Path,
    cover_path: Path | None,
    chunk_seconds: float,
    offset: int,
) -> list[dict[str, Any]]:
    stego_samples, sample_rate = read_mono_samples(stego_path)
    stego_chunks = chunk_audio(stego_samples, sample_rate, chunk_seconds)

    cover_chunks: list[list[float]] = []
    if cover_path is not None and cover_path.exists():
        cover_samples, cover_rate = read_mono_samples(cover_path)
        cover_chunks = chunk_audio(cover_samples, cover_rate, chunk_seconds)

    metrics: list[dict[str, Any]] = []
    for index, stego_chunk in enumerate(stego_chunks):
        cover_chunk = cover_chunks[index] if index < len(cover_chunks) else []
        mse = mean_squared_error(cover_chunk, stego_chunk) if cover_chunk else None
        snr_db = signal_to_noise_ratio(cover_chunk, stego_chunk) if cover_chunk else None
        stft_delta = spectrogram_delta_score(cover_chunk, stego_chunk) if cover_chunk else None
        rms = math.sqrt(sum(sample * sample for sample in stego_chunk) / max(1, len(stego_chunk)))
        normalized_rms = min(1.0, rms * 4.0)

        confidence = clamp_score(
            (snr_db if snr_db is not None else normalized_rms * 40.0) * 1.2
            + (40.0 if mse is None else max(0.0, 40.0 - mse * 2000.0))
        )
        status = "complete" if confidence >= 70 else "corrected" if confidence >= 45 else "low_confidence"

        metrics.append(
            {
                "chunkIndex": offset + index,
                "partNumber": part_number,
                "status": status,
                "confidence": confidence,
                "snrDb": round(snr_db, 2) if snr_db is not None else None,
                "mse": round(mse, 6) if mse is not None else None,
                "stftDeltaScore": round(stft_delta, 6) if stft_delta is not None else None,
                "bitAgreement": None,
                "correctionApplied": False,
                "correctionCount": 0,
                "isMissing": False,
                "isDuplicate": False,
            }
        )

    return metrics


def persist_analysis(analysis_id: str, source_type: str, source_ref_id: str, summary: dict[str, Any], chunk_table: list[dict[str, Any]]) -> None:
    db = get_db()
    db.execute(
        """
        INSERT OR REPLACE INTO analysis_runs (analysis_id, source_type, source_ref_id, status, completed_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        """,
        (analysis_id, source_type, source_ref_id, "completed"),
    )
    db.execute("DELETE FROM analysis_metrics WHERE analysis_id = ?", (analysis_id,))
    db.execute("DELETE FROM chunk_analysis_metrics WHERE analysis_id = ?", (analysis_id,))

    db.execute(
        """
        INSERT INTO analysis_metrics (
            analysis_id, recovery_confidence, integrity_score, header_valid, sequence_valid,
            files_processed, files_total, payload_chunks, ignored_tail, corrections_applied,
            corrections_count, missing_parts_count, duplicate_parts_count, snr_db_overall,
            mse_overall, stft_delta_score, recovered_text
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            analysis_id,
            summary.get("recoveryConfidence"),
            summary.get("integrityScore"),
            bool_to_int(summary.get("headerValid")),
            bool_to_int(summary.get("sequenceValid")),
            summary.get("filesProcessed"),
            summary.get("filesTotal"),
            summary.get("payloadChunks"),
            summary.get("ignoredTail"),
            bool_to_int(summary.get("correctionsApplied")),
            summary.get("correctionsCount"),
            summary.get("missingPartsCount"),
            summary.get("duplicatePartsCount"),
            summary.get("overallSnrDb"),
            summary.get("overallMse"),
            summary.get("stftDeltaScore"),
            summary.get("recoveredText"),
        ),
    )

    for row in chunk_table:
        db.execute(
            """
            INSERT INTO chunk_analysis_metrics (
                analysis_id, chunk_index, part_number, status, confidence, snr_db, mse, stft_delta_score,
                bit_agreement, correction_applied, correction_count, is_missing, is_duplicate, sequence_valid
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                analysis_id,
                row.get("chunkIndex"),
                row.get("partNumber"),
                row.get("status"),
                row.get("confidence"),
                row.get("snrDb"),
                row.get("mse"),
                row.get("stftDeltaScore"),
                row.get("bitAgreement"),
                bool_to_int(row.get("correctionApplied")),
                row.get("correctionCount"),
                bool_to_int(row.get("isMissing")),
                bool_to_int(row.get("isDuplicate")),
                1,
            ),
        )

    db.commit()


def terminal_analysis_payload(
    *,
    status: str,
    error_code: str,
    reason: str,
    message_id: str,
    source: dict[str, Any] | None = None,
    missing_paths: list[Path] | None = None,
    elapsed_ms: int | None = None,
) -> dict[str, Any]:
    source = source or {}
    missing_paths = missing_paths or []

    files_total = int(source.get("files_total") or max(1, len(source.get("expected_audio_paths") or [])))
    files_processed = len(source.get("audio_paths") or [])
    mode = "single" if source.get("mode") == "single" else "grouped" if source.get("mode") == "grouped" else "single"
    analysis_id = f"analysis_{source.get('analysis_message_id') or message_id or 'invalid'}"

    missing_parts = []
    for path in missing_paths:
        parsed = parse_transmission_filename(path.name)
        if parsed:
            missing_parts.append(int(parsed["segment_index"]) + 1)

    print(
        f"[analysis] terminal status={status} code={error_code} target={message_id} "
        f"mode={mode} files={files_processed}/{files_total} missing={[p.name for p in missing_paths]}"
    )

    return {
        "analysisId": analysis_id,
        "mode": mode,
        "sourceType": mode,
        "normalizedSinglePart": bool(source.get("normalized_from_single_part_transmission")),
        "status": status,
        "terminal": True,
        "errorCode": error_code,
        "reason": reason,
        "message": reason,
        "elapsedMs": elapsed_ms,
        "transmissionId": source.get("transmission_id"),
        "selectedPartNumber": source.get("selected_part_number"),
        "selectedPartFilename": source.get("selected_part_filename"),
        "missingParts": missing_parts,
        "filesProcessed": files_processed,
        "filesTotal": files_total,
        "summary": {
            "recoveryStatus": "partial" if status == "partial" else "failed",
            "recoveryConfidence": 0,
            "integrityScore": 0,
            "headerValid": None,
            "sequenceValid": False if status in {"partial", "missing_source"} else None,
            "filesProcessed": files_processed,
            "filesTotal": files_total,
            "payloadChunks": 0,
            "ignoredTail": 0,
            "correctionsApplied": False,
            "correctionsCount": 0,
            "missingPartsCount": len(missing_paths),
            "duplicatePartsCount": 0,
            "overallSnrDb": None,
            "overallMse": None,
            "stftDeltaScore": None,
            "recoveredText": None,
            "trustMessage": reason,
        },
        "provenance": {
            "hasCoverStegoLink": False,
            "grouped": mode == "grouped",
            "transmissionId": source.get("transmission_id"),
            "assets": [],
        },
        "charts": {
            "confidenceByChunk": [],
            "sequenceProgress": [
                {
                    "partNumber": index + 1,
                    "status": "missing" if (index + 1) in missing_parts else "complete",
                }
                for index in range(files_total)
            ],
            "snrByChunk": [],
            "correctionImpact": [],
            "confidenceTrend": [],
            "payloadStructure": {
                "headerBlocks": 0,
                "payloadBlocks": 0,
                "redundancyBlocks": 0,
                "ignoredTailBlocks": 0,
                "duplicateBlocks": 0,
            },
            "compareSpectrogram": {
                "available": False,
                "reason": "Unavailable because analysis did not reach artifact generation.",
            },
            "waveformComparison": {"available": False},
        },
        "chunkTable": [],
        "recovery": {
            "corrected_text": None,
            "raw_text": None,
            "changes": [],
            "recovery_status": "failed",
        },
        "legacy": None,
    }


def _analysis_progress_event(step: str, label: str, detail: str | None = None) -> dict[str, Any]:
    return {
        "step": step,
        "label": label,
        "detail": detail or "",
        "ts": int(time.time() * 1000),
    }


def _build_grouped_analysis_from_reveal(
    *,
    message_id: str,
    source: dict[str, Any],
    decode: dict[str, Any],
    encode: dict[str, Any] | None,
    cfg: dict[str, Any],
    elapsed_ms: int,
) -> dict[str, Any]:
    """
    Build a fully renderable Analysis payload from grouped Reveal-style reconstruction.
    This is the critical fallback when no persisted forensic artifact exists.
    """
    audio_paths: list[Path] = source.get("audio_paths") or []
    total_files = int(source.get("files_total") or len(audio_paths) or 1)
    transmission_id = source.get("transmission_id")
    selected_part_number = source.get("selected_part_number")
    selected_part_filename = source.get("selected_part_filename")

    generation_rows = load_generation_rows(source.get("analysis_message_id") or message_id, encode)
    compare = build_compare_artifacts(
        analysis_id=f"analysis_{source.get('analysis_message_id') or message_id}",
        generation_rows=generation_rows,
        selected_part=selected_part_number,
    )

    chunk_table: list[dict[str, Any]] = []
    chunk_offset = 0
    chunk_seconds = float(cfg.get("chunk_seconds") or 2.0)

    generation_by_part: dict[int, dict[str, Any]] = {}
    for row in generation_rows:
        part_no = int(row.get("part_number") or 1)
        generation_by_part[part_no] = row

    for index, stego_path in enumerate(audio_paths):
        part_number = index + 1
        gen_row = generation_by_part.get(part_number)
        cover_path = None
        if gen_row and gen_row.get("cover_file_path"):
            possible_cover = BASE_DIR / str(gen_row["cover_file_path"])
            if possible_cover.exists():
                cover_path = possible_cover

        rows = build_chunk_metrics_for_path(
            part_number=part_number,
            stego_path=stego_path,
            cover_path=cover_path,
            chunk_seconds=chunk_seconds,
            offset=chunk_offset,
        )
        chunk_table.extend(rows)
        chunk_offset += len(rows)

    confidences = [float(row["confidence"]) for row in chunk_table if row.get("confidence") is not None]
    snr_values = [float(row["snrDb"]) for row in chunk_table if row.get("snrDb") is not None]
    mse_values = [float(row["mse"]) for row in chunk_table if row.get("mse") is not None]

    avg_conf = round(sum(confidences) / len(confidences), 2) if confidences else 0.0
    avg_snr = round(sum(snr_values) / len(snr_values), 2) if snr_values else None
    avg_mse = round(sum(mse_values) / len(mse_values), 6) if mse_values else None

    missing_parts = decode.get("missing_segments") or []
    changes = decode.get("changes") or []
    recovered_text = (
        decode.get("corrected_text")
        or decode.get("recovered_text")
        or decode.get("raw_text")
        or ""
    )

    recovery_success = bool(decode.get("success"))
    recovery_status = decode.get("recovery_status") or ("complete" if recovery_success else "failed")

    integrity_score = avg_conf
    if missing_parts:
        integrity_score = max(0.0, avg_conf - (len(missing_parts) * 12.0))
    if changes:
        integrity_score = max(0.0, integrity_score - min(8.0, float(len(changes)) * 1.5))
    integrity_score = round(integrity_score, 2)

    summary = {
        "recoveryStatus": "complete" if recovery_success else ("partial" if missing_parts else "failed"),
        "recoveryConfidence": avg_conf,
        "integrityScore": integrity_score,
        "headerValid": bool(decode.get("header_valid", True)),
        "sequenceValid": len(missing_parts) == 0,
        "filesProcessed": int(decode.get("received_segments") or len(audio_paths)),
        "filesTotal": total_files,
        "payloadChunks": int(decode.get("payload_chunks_needed") or 0),
        "ignoredTail": int(decode.get("ignored_tail_chunks") or 0),
        "correctionsApplied": bool(changes),
        "correctionsCount": len(changes),
        "missingPartsCount": len(missing_parts),
        "duplicatePartsCount": 0,
        "overallSnrDb": avg_snr,
        "overallMse": avg_mse,
        "stftDeltaScore": None,
        "recoveredText": recovered_text or None,
        "trustMessage": (
            "Recovery validated from available transmission evidence."
            if recovery_success and recovered_text
            else "Recovery could not be validated from the available transmission evidence."
        ),
    }

    analysis_id = f"analysis_{source.get('analysis_message_id') or message_id}"

    confidence_by_chunk = [
        {"chunkIndex": row["chunkIndex"], "confidence": row["confidence"]}
        for row in chunk_table
    ]
    snr_by_chunk = [
        {"chunkIndex": row["chunkIndex"], "snrDb": row["snrDb"]}
        for row in chunk_table
        if row.get("snrDb") is not None
    ]
    confidence_trend = [
        {"sequenceIndex": idx, "confidence": row["confidence"]}
        for idx, row in enumerate(chunk_table)
    ]

    sequence_progress = []
    total_segments = int(decode.get("total_segments") or total_files)
    missing_segments = set(int(x) for x in (decode.get("missing_segments") or []))
    for part_no in range(1, total_segments + 1):
        sequence_progress.append(
            {
                "partNumber": part_no,
                "status": "missing" if part_no in missing_segments else "complete",
            }
        )

    cover_waveform = []
    stego_waveform = []
    diff_waveform = []

    selected_part = selected_part_number or 1
    selected_stego = None
    if 1 <= selected_part <= len(audio_paths):
        selected_stego = audio_paths[selected_part - 1]

    selected_generation = None
    for row in generation_rows:
        if int(row.get("part_number") or 1) == selected_part:
            selected_generation = row
            break

    if selected_stego and selected_generation and selected_generation.get("cover_file_path"):
        cover_candidate = BASE_DIR / str(selected_generation["cover_file_path"])
        if cover_candidate.exists():
            cover_samples, _ = read_mono_samples(cover_candidate)
            stego_samples, _ = read_mono_samples(selected_stego)
            compare_count = min(len(cover_samples), len(stego_samples))
            diff_samples = [stego_samples[i] - cover_samples[i] for i in range(compare_count)]
            cover_waveform = build_waveform_points(cover_samples, 240)
            stego_waveform = build_waveform_points(stego_samples, 240)
            diff_waveform = build_waveform_points(diff_samples, 240)

    payload = {
        "analysisId": analysis_id,
        "mode": "grouped",
        "sourceType": "grouped",
        "normalizedSinglePart": False,
        "status": "complete",
        "terminal": False,
        "errorCode": None,
        "reason": None,
        "message": None,
        "elapsedMs": elapsed_ms,
        "transmissionId": transmission_id,
        "selectedPartNumber": selected_part_number,
        "selectedPartFilename": selected_part_filename,
        "missingParts": decode.get("missing_segments") or [],
        "filesProcessed": int(decode.get("received_segments") or total_files),
        "filesTotal": total_files,
        "summary": summary,
        "provenance": {
            "hasCoverStegoLink": bool(compare.get("available")),
            "grouped": True,
            "transmissionId": transmission_id,
            "assets": [
                {
                    "partNumber": idx + 1,
                    "fileName": audio_paths[idx].name if idx < len(audio_paths) else None,
                }
                for idx in range(len(audio_paths))
            ],
        },
        "charts": {
            "confidenceByChunk": confidence_by_chunk,
            "sequenceProgress": sequence_progress,
            "snrByChunk": snr_by_chunk,
            "correctionImpact": [
                {"label": "Corrections", "value": len(changes)},
                {"label": "Missing", "value": len(missing_parts)},
            ],
            "confidenceTrend": confidence_trend,
            "payloadStructure": {
                "headerBlocks": int(HEADER_NIBBLES * int(cfg.get("repeat_factor") or 1)),
                "payloadBlocks": int(decode.get("payload_chunks_needed") or 0),
                "redundancyBlocks": 0,
                "ignoredTailBlocks": int(decode.get("ignored_tail_chunks") or 0),
                "duplicateBlocks": 0,
            },
            "compareSpectrogram": {
                "available": bool(compare.get("available")),
                "coverImageUrl": compare.get("coverImageUrl"),
                "stegoImageUrl": compare.get("stegoImageUrl"),
                "diffImageUrl": compare.get("diffImageUrl"),
                "selectedPart": compare.get("selectedPart"),
                "partOptions": compare.get("partOptions") or [],
            },
            "waveformComparison": {
                "available": bool(cover_waveform and stego_waveform),
                "coverWaveform": cover_waveform,
                "stegoWaveform": stego_waveform,
                "differenceWaveform": diff_waveform,
            },
        },
        "chunkTable": chunk_table,
        "recovery": {
            "corrected_text": decode.get("corrected_text") or decode.get("recovered_text"),
            "raw_text": decode.get("raw_text") or decode.get("recovered_text"),
            "changes": changes,
            "recovery_status": recovery_status,
        },
        "legacy": None,
        "progress": [
            _analysis_progress_event("resolve", "Resolved grouped transmission", f"{len(audio_paths)}/{total_files} parts"),
            _analysis_progress_event("decode", "Recovered grouped sequence", f"status={recovery_status}"),
            _analysis_progress_event("metrics", "Computed forensic metrics", f"{len(chunk_table)} chunks"),
            _analysis_progress_event("render", "Prepared grouped analysis payload", "Charts and diagnostics ready"),
        ],
    }

    persist_analysis(
        analysis_id=analysis_id,
        source_type="grouped",
        source_ref_id=transmission_id or message_id,
        summary=summary,
        chunk_table=chunk_table,
    )

    return payload


def analyze_message(
    *,
    message_id: str | None = None,
    source_type: str | None = None,
    transmission_id: str | None = None,
    selected_part_number: int | None = None,
    selected_part_filename: str | None = None,
    audio_url: str | None = None,
    file_name: str | None = None,
    total_parts: int | None = None,
) -> dict[str, Any]:
    """
    Main Analysis entrypoint.

    Critical behavior:
    - If total_parts > 1, Analysis ALWAYS runs in grouped mode (same semantics as Reveal).
    - Never silently fall back to single-file analysis for grouped transmissions.
    - Reuse persisted reveal/decode only if it is SUCCESSFUL and COMPLETE.
    - If no persisted forensic artifact exists, build a full renderable analysis payload
      from grouped reveal reconstruction so the UI still gets charts / diagnostics.
    """
    ensure_dirs()
    started_at = time.time()
    cfg = load_cfg()

    target_label = (
        transmission_id
        or message_id
        or selected_part_filename
        or file_name
        or Path(audio_url or "").name
        or "unknown"
    )

    source = resolve_analysis_target(
        message_id=message_id,
        source_type=source_type,
        transmission_id=transmission_id,
        selected_part_number=selected_part_number,
        selected_part_filename=selected_part_filename,
        audio_url=audio_url,
        file_name=file_name,
        total_parts=total_parts,
    )

    normalized_single_part = bool(source.get("normalized_from_single_part_transmission"))
    analysis_message_id = source.get("analysis_message_id") or message_id or target_label
    mode = source.get("mode") or "single"

    print(
        f"[analysis] start target={target_label} "
        f"mode={mode} "
        f"normalized_single_part={normalized_single_part} "
        f"tx={source.get('transmission_id')} "
        f"part={source.get('selected_part_number')}"
    )

    audio_paths: list[Path] = source.get("audio_paths") or []
    expected_audio_paths: list[Path] = source.get("expected_audio_paths") or []
    missing_audio_paths: list[Path] = source.get("missing_audio_paths") or []
    files_total = int(source.get("files_total") or max(1, len(expected_audio_paths) or len(audio_paths) or 1))

    if mode == "grouped":
        if files_total <= 1:
            mode = "single"
            source["mode"] = "single"
        else:
            if missing_audio_paths:
                elapsed_ms = int((time.time() - started_at) * 1000)
                return terminal_analysis_payload(
                    status="missing_source",
                    error_code="missing_group_parts",
                    reason=(
                        f"Grouped analysis requires all parts. "
                        f"Found {len(audio_paths)} of {files_total} part(s)."
                    ),
                    message_id=analysis_message_id,
                    source=source,
                    missing_paths=missing_audio_paths,
                    elapsed_ms=elapsed_ms,
                )
            if len(audio_paths) != files_total:
                elapsed_ms = int((time.time() - started_at) * 1000)
                return terminal_analysis_payload(
                    status="missing_source",
                    error_code="group_part_count_mismatch",
                    reason=(
                        f"Grouped analysis expected {files_total} part(s) "
                        f"but only resolved {len(audio_paths)} file(s)."
                    ),
                    message_id=analysis_message_id,
                    source=source,
                    missing_paths=missing_audio_paths,
                    elapsed_ms=elapsed_ms,
                )

    if not audio_paths:
        elapsed_ms = int((time.time() - started_at) * 1000)
        return terminal_analysis_payload(
            status="missing_source",
            error_code="audio_not_found",
            reason="No audio source could be resolved for analysis.",
            message_id=analysis_message_id,
            source=source,
            missing_paths=missing_audio_paths,
            elapsed_ms=elapsed_ms,
        )

    encode = source.get("encode")
    persisted_decode = source.get("decode")

    reusable_decode = None
    if persisted_decode:
        persisted_success = bool(persisted_decode.get("success"))
        persisted_status = (persisted_decode.get("recovery_status") or "").lower()

        is_group_complete = (
            persisted_success
            and (
                persisted_status in {"complete", "decoded_uncorrected", "minor_corrected"}
                or (
                    mode == "grouped"
                    and persisted_decode.get("received_segments") == persisted_decode.get("total_segments")
                )
            )
        )

        if is_group_complete:
            reusable_decode = persisted_decode
            print(
                f"[analysis] grouped reuse existing reveal "
                f"tx={source.get('transmission_id')} success=True status={persisted_status or 'complete'}"
            )
        else:
            print(
                f"[analysis] grouped reveal artifact exists but not usable "
                f"tx={source.get('transmission_id')} "
                f"success={persisted_success} status={persisted_status or 'unknown'} -> recomputing"
            )

    decode_result: dict[str, Any] | None = reusable_decode

    if decode_result is None:
        try:
            if mode == "grouped" and len(audio_paths) > 1:
                print(f"[analysis] decoding grouped transmission tx={source.get('transmission_id')}")
                decode_result = recover_grouped_transmission(
                    audio_paths,
                    transmission_id=source.get("transmission_id"),
                    persist=True,
                    per_file_timeout_seconds=GROUPED_ANALYSIS_TIMEOUT_SECONDS,
                )
            else:
                target_path = audio_paths[0]
                print(f"[analysis] decoding single source file={target_path.name}")
                decode_result = decode_audio_path(
                    target_path,
                    message_id=analysis_message_id,
                    timeout_seconds=SINGLE_ANALYSIS_TIMEOUT_SECONDS,
                )
        except subprocess.TimeoutExpired:
            elapsed_ms = int((time.time() - started_at) * 1000)
            return terminal_analysis_payload(
                status="timed_out",
                error_code="analysis_timeout",
                reason="Analysis timed out before Aura could finish decoding the selected audio.",
                message_id=analysis_message_id,
                source=source,
                missing_paths=[],
                elapsed_ms=elapsed_ms,
            )
        except Exception as exc:
            elapsed_ms = int((time.time() - started_at) * 1000)
            return terminal_analysis_payload(
                status="failed",
                error_code="analysis_decode_failed",
                reason=f"Analysis failed during decode: {str(exc)}",
                message_id=analysis_message_id,
                source=source,
                missing_paths=[],
                elapsed_ms=elapsed_ms,
            )

    if decode_result is None:
        elapsed_ms = int((time.time() - started_at) * 1000)
        return terminal_analysis_payload(
            status="failed",
            error_code="no_decode_result",
            reason="Aura did not produce a decode result for analysis.",
            message_id=analysis_message_id,
            source=source,
            missing_paths=[],
            elapsed_ms=elapsed_ms,
        )

    if mode == "grouped" and not bool(decode_result.get("success")):
        recovery_status_value = (decode_result.get("recovery_status") or "").lower()
        elapsed_ms = int((time.time() - started_at) * 1000)

        if recovery_status_value == "incomplete":
            return terminal_analysis_payload(
                status="partial",
                error_code="grouped_recovery_incomplete",
                reason=decode_result.get("error") or "Grouped transmission recovery is incomplete.",
                message_id=analysis_message_id,
                source=source,
                missing_paths=[
                    expected_audio_paths[idx - 1]
                    for idx in (decode_result.get("missing_segments") or [])
                    if 0 < idx <= len(expected_audio_paths)
                ],
                elapsed_ms=elapsed_ms,
            )

        return terminal_analysis_payload(
            status="failed",
            error_code="grouped_recovery_failed",
            reason=decode_result.get("error") or "Grouped transmission recovery failed.",
            message_id=analysis_message_id,
            source=source,
            missing_paths=[],
            elapsed_ms=elapsed_ms,
        )

    if mode == "single":
        analysis_id = f"analysis_{analysis_message_id}"
        generation_rows = load_generation_rows(analysis_message_id, encode)
        compare = build_compare_artifacts(
            analysis_id=analysis_id,
            generation_rows=generation_rows,
            selected_part=1,
        )

        target_path = audio_paths[0]
        cover_path = None
        if generation_rows:
            first = generation_rows[0]
            cover_file = first.get("cover_file_path")
            if cover_file:
                possible_cover = BASE_DIR / str(cover_file)
                if possible_cover.exists():
                    cover_path = possible_cover

        chunk_seconds = float(cfg.get("chunk_seconds") or 2.0)
        chunk_table = build_chunk_metrics_for_path(
            part_number=1,
            stego_path=target_path,
            cover_path=cover_path,
            chunk_seconds=chunk_seconds,
            offset=0,
        )

        confidences = [float(row["confidence"]) for row in chunk_table if row.get("confidence") is not None]
        snr_values = [float(row["snrDb"]) for row in chunk_table if row.get("snrDb") is not None]
        mse_values = [float(row["mse"]) for row in chunk_table if row.get("mse") is not None]

        avg_conf = round(sum(confidences) / len(confidences), 2) if confidences else 0.0
        avg_snr = round(sum(snr_values) / len(snr_values), 2) if snr_values else None
        avg_mse = round(sum(mse_values) / len(mse_values), 6) if mse_values else None

        changes = decode_result.get("changes") or []
        recovered_text = (
            decode_result.get("corrected_text")
            or decode_result.get("raw_text")
            or ""
        )

        summary = {
            "recoveryStatus": "complete" if bool(decode_result.get("success")) else "failed",
            "recoveryConfidence": avg_conf,
            "integrityScore": avg_conf,
            "headerValid": bool(decode_result.get("header_valid", True)),
            "sequenceValid": True,
            "filesProcessed": 1,
            "filesTotal": 1,
            "payloadChunks": int(decode_result.get("payload_chunks_needed") or 0),
            "ignoredTail": int(decode_result.get("ignored_tail_chunks") or 0),
            "correctionsApplied": bool(changes),
            "correctionsCount": len(changes),
            "missingPartsCount": 0,
            "duplicatePartsCount": 0,
            "overallSnrDb": avg_snr,
            "overallMse": avg_mse,
            "stftDeltaScore": None,
            "recoveredText": recovered_text or None,
            "trustMessage": (
                "Recovery validated from available signal evidence."
                if recovered_text
                else "Recovery could not be verified from the available signal evidence."
            ),
        }

        confidence_by_chunk = [
            {"chunkIndex": row["chunkIndex"], "confidence": row["confidence"]}
            for row in chunk_table
        ]
        snr_by_chunk = [
            {"chunkIndex": row["chunkIndex"], "snrDb": row["snrDb"]}
            for row in chunk_table
        ]
        confidence_trend = [
            {"sequenceIndex": idx, "confidence": row["confidence"]}
            for idx, row in enumerate(chunk_table)
        ]

        cover_waveform = []
        stego_waveform = []
        diff_waveform = []
        if cover_path and cover_path.exists():
            cover_samples, _ = read_mono_samples(cover_path)
            stego_samples, _ = read_mono_samples(target_path)
            count = min(len(cover_samples), len(stego_samples))
            diff_samples = [stego_samples[i] - cover_samples[i] for i in range(count)]
            cover_waveform = build_waveform_points(cover_samples, 240)
            stego_waveform = build_waveform_points(stego_samples, 240)
            diff_waveform = build_waveform_points(diff_samples, 240)

        payload = {
            "analysisId": analysis_id,
            "mode": "single",
            "sourceType": "single",
            "normalizedSinglePart": normalized_single_part,
            "status": "complete",
            "terminal": False,
            "errorCode": None,
            "reason": None,
            "message": None,
            "elapsedMs": int((time.time() - started_at) * 1000),
            "transmissionId": None,
            "selectedPartNumber": 1,
            "selectedPartFilename": target_path.name,
            "missingParts": [],
            "filesProcessed": 1,
            "filesTotal": 1,
            "summary": summary,
            "provenance": {
                "hasCoverStegoLink": bool(compare.get("available")),
                "grouped": False,
                "transmissionId": None,
                "assets": [
                    {
                        "partNumber": 1,
                        "fileName": target_path.name,
                    }
                ],
            },
            "charts": {
                "confidenceByChunk": confidence_by_chunk,
                "sequenceProgress": [{"partNumber": 1, "status": "complete"}],
                "snrByChunk": snr_by_chunk,
                "correctionImpact": [
                    {"label": "Corrections", "value": len(changes)}
                ],
                "confidenceTrend": confidence_trend,
                "payloadStructure": {
                    "headerBlocks": int(decode_result.get("header_chunks") or 0),
                    "payloadBlocks": int(decode_result.get("payload_chunks_needed") or 0),
                    "redundancyBlocks": 0,
                    "ignoredTailBlocks": int(decode_result.get("ignored_tail_chunks") or 0),
                    "duplicateBlocks": 0,
                },
                "compareSpectrogram": {
                    "available": bool(compare.get("available")),
                    "coverImageUrl": compare.get("coverImageUrl"),
                    "stegoImageUrl": compare.get("stegoImageUrl"),
                    "diffImageUrl": compare.get("diffImageUrl"),
                },
                "waveformComparison": {
                    "available": bool(cover_waveform and stego_waveform),
                    "coverWaveform": cover_waveform,
                    "stegoWaveform": stego_waveform,
                    "differenceWaveform": diff_waveform,
                },
            },
            "chunkTable": chunk_table,
            "recovery": {
                "corrected_text": decode_result.get("corrected_text"),
                "raw_text": decode_result.get("raw_text"),
                "changes": changes,
                "recovery_status": decode_result.get("recovery_status") or "complete",
            },
            "legacy": None,
            "progress": [
                _analysis_progress_event("resolve", "Resolved audio source", target_path.name),
                _analysis_progress_event("decode", "Decoded signal evidence", "Single-file decode completed"),
                _analysis_progress_event("metrics", "Computed forensic metrics", f"{len(chunk_table)} chunks"),
                _analysis_progress_event("render", "Prepared analysis payload", "Charts and diagnostics ready"),
            ],
        }

        persist_analysis(
            analysis_id=analysis_id,
            source_type="single",
            source_ref_id=analysis_message_id,
            summary=summary,
            chunk_table=chunk_table,
        )
        return payload

    try:
        print(f"[analysis] building grouped forensic payload tx={source.get('transmission_id')}")
        payload = _build_grouped_analysis_from_reveal(
            message_id=analysis_message_id,
            source=source,
            decode=decode_result,
            encode=encode,
            cfg=cfg,
            elapsed_ms=int((time.time() - started_at) * 1000),
        )
        return payload
    except Exception as exc:
        elapsed_ms = int((time.time() - started_at) * 1000)
        print(f"[analysis] grouped forensic payload build failed: {exc}")
        return terminal_analysis_payload(
            status="failed",
            error_code="grouped_payload_build_failed",
            reason=(
                "Aura completed grouped recovery, but failed while building the "
                f"forensic payload: {str(exc)}"
            ),
            message_id=analysis_message_id,
            source=source,
            missing_paths=[],
            elapsed_ms=elapsed_ms,
        )