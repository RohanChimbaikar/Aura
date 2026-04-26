from __future__ import annotations

import json
import math
import re
import struct
import subprocess
import sys
import uuid
import wave
from pathlib import Path
from typing import Any

from services.db import get_db


BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = BASE_DIR / "aura-model-v1"
CARRIER_DIR = BASE_DIR / "aura_carrier_bank"
OUTPUT_DIR = BASE_DIR / "outputs"
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


def ensure_dirs() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
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


def capacity_for_text(text: str) -> dict[str, Any]:
    cfg = load_cfg()
    message_length = len(text)
    header_chunks = HEADER_NIBBLES * int(cfg["repeat_factor"])
    payload_nibbles = message_length * 2
    payload_chunks = message_length * int(cfg["chunks_per_char_protected"])
    required_chunks = header_chunks + payload_chunks
    required_seconds = required_chunks * float(cfg["chunk_seconds"])
    carrier_path, carrier_duration = select_safe_carrier(required_seconds)

    return {
        "success": True,
        "message_length": message_length,
        "header_bytes": HEADER_BYTES,
        "header_nibbles": HEADER_NIBBLES,
        "header_chunks": header_chunks,
        "payload_nibbles": payload_nibbles,
        "payload_chunks": payload_chunks,
        "required_chunks": required_chunks,
        "required_seconds": round(required_seconds, 2),
        "required_minutes": round(required_seconds / 60.0, 2),
        "mode": "safe_dynamic",
        "carrier_alias": alias_for_carrier(carrier_path),
        "carrier_path": str(carrier_path.relative_to(BASE_DIR)),
        "carrier_duration_sec": round(carrier_duration, 2),
        "safe_status": "safe",
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


def encode_text(text: str) -> dict[str, Any]:
    ensure_dirs()
    preview = capacity_for_text(text)
    message_id = f"msg_{uuid.uuid4().hex[:10]}"
    file_name = f"{message_id}.wav"
    out_path = OUTPUT_DIR / file_name

    command = [
        sys.executable,
        str(SENDER_SCRIPT),
        "--config",
        str(CONFIG_FILE),
        "--carrier-dir",
        str(CARRIER_DIR),
        "--safe-mode",
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

    result = {
        **preview,
        "success": True,
        "message_id": message_id,
        "audio_url": f"/outputs/{file_name}",
        "file_name": file_name,
        "protection": "length_header_repeat3",
        "sender_stdout": completed.stdout,
    }
    save_encode_record(message_id, result)
    return result


def decode_audio_path(path: Path, message_id: str | None = None) -> dict[str, Any]:
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
        timeout=300,
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


def analysis_for_message(message_id: str) -> dict[str, Any]:
    records = load_records()
    record = records.get(message_id, {})
    encode = record.get("encode")
    decode = record.get("decode")
    cfg = load_cfg()
    upload_transfer = None
    audio_path = OUTPUT_DIR / f"{message_id}.wav"
    if not audio_path.exists() and message_id.isdigit():
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
    chart_data = signal_data_for_audio(audio_path)
    wav_props = get_wav_props(audio_path) if audio_path.exists() else {}
    duration = wav_props.get("audio_duration_sec")
    if duration is None and encode:
        duration = encode.get("required_seconds")
    file_name = encode.get("file_name") if encode else None
    if file_name is None and upload_transfer is not None:
        file_name = upload_transfer["original_filename"]

    return {
        "message_id": message_id,
        "signal": {
            "file_name": file_name or message_id,
            "source": "generated" if encode else "uploaded",
            "duration": duration,
            "durationSec": duration,
            "sample_rate": wav_props.get("sample_rate") or cfg["sample_rate"],
            "sampleRate": wav_props.get("sample_rate") or cfg["sample_rate"],
            "channels": wav_props.get("channels") or 1,
            "total_chunks": decode.get("total_chunks") if decode else encode.get("required_chunks") if encode else None,
            **chart_data,
        },
        "payload": {
            "header_mode_enabled": True,
            "header_bytes": HEADER_BYTES,
            "header_nibbles": HEADER_NIBBLES,
            "header_chunks": HEADER_NIBBLES * cfg["repeat_factor"],
            "payload_mode": "ASCII text",
            "protection": "repeat-3 nibble voting",
            "chunk_duration": cfg["chunk_seconds"],
        },
        "encode": encode,
        "decode": decode,
        "recovery": {
            "corrected_text": decode.get("corrected_text") if decode else None,
            "raw_text": decode.get("raw_text") if decode else None,
            "changes": decode.get("changes", []) if decode else [],
            "recovery_status": decode.get("recovery_status") if decode else None,
        },
    }