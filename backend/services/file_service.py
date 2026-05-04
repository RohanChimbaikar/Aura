from datetime import datetime, timezone
import re
from pathlib import Path
import subprocess
import sys
from uuid import uuid4

from flask import current_app, send_from_directory
from werkzeug.utils import secure_filename

from services.db import get_db

_SQLITE_TS = re.compile(
    r"^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$"
)


def utc_iso_timestamp(value) -> str:
    """Normalize DB or API timestamps to UTC ISO-8601 with Z. Never returns empty."""
    fallback = (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )
    if value is None:
        return fallback
    s = str(value).strip()
    if not s:
        return fallback

    m = _SQLITE_TS.match(s)
    if m:
        year, month, day, hour, minute, second, frac = m.groups()
        usec = 0
        if frac:
            usec = int((frac + "000000")[:6])
        dt = datetime(
            int(year),
            int(month),
            int(day),
            int(hour),
            int(minute),
            int(second),
            usec,
            tzinfo=timezone.utc,
        )
        return dt.isoformat().replace("+00:00", "Z")

    try:
        normalized = s.replace("Z", "+00:00")
        if " " in normalized and "T" not in normalized[:11]:
            normalized = normalized.replace(" ", "T", 1)
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return dt.isoformat().replace("+00:00", "Z")
    except ValueError:
        return fallback


def allowed_wav(filename: str) -> bool:
    return "." in filename and filename.lower().endswith(".wav")


def save_uploaded_transfer(file_storage, sender: str, receiver: str) -> dict:
    original_filename = secure_filename(file_storage.filename or "")
    if not original_filename or not allowed_wav(original_filename):
        raise ValueError("Only .wav files are allowed.")

    extension = Path(original_filename).suffix.lower()
    stored_filename = f"{uuid4().hex}{extension}"
    upload_dir = Path(current_app.config["UPLOAD_FOLDER"])
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / stored_filename
    file_storage.save(file_path)
    file_size = file_path.stat().st_size

    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO audio_transfers (
            sender,
            receiver,
            original_filename,
            stored_filename,
            file_size
        ) VALUES (?, ?, ?, ?, ?)
        """,
        (sender, receiver, original_filename, stored_filename, file_size),
    )
    db.commit()

    row = db.execute(
        """
        SELECT id, sender, receiver, original_filename, stored_filename, file_size, created_at
        FROM audio_transfers
        WHERE id = ?
        """,
        (cursor.lastrowid,),
    ).fetchone()
    return serialize_transfer(row)


def list_accessible_transfers(username: str, direction: str | None = None) -> list[dict]:
    db = get_db()
    query = """
        SELECT id, sender, receiver, original_filename, stored_filename, file_size, created_at
        FROM audio_transfers
    """
    params: tuple[str, ...]

    if direction == "received":
        query += " WHERE receiver = ?"
        params = (username,)
    elif direction == "sent":
        query += " WHERE sender = ?"
        params = (username,)
    else:
        query += " WHERE sender = ? OR receiver = ?"
        params = (username, username)

    query += " ORDER BY datetime(created_at) DESC, id DESC"
    rows = db.execute(query, params).fetchall()
    return [serialize_transfer(row) for row in rows]


def get_transfer_by_id(transfer_id: int):
    db = get_db()
    return db.execute(
        """
        SELECT id, sender, receiver, original_filename, stored_filename, file_size, created_at
        FROM audio_transfers
        WHERE id = ?
        """,
        (transfer_id,),
    ).fetchone()


def serialize_transfer(row) -> dict:
    transfer_id = row["id"]
    created_at = utc_iso_timestamp(row["created_at"])
    return {
        "id": transfer_id,
        "messageId": str(transfer_id),
        "sender": row["sender"],
        "receiver": row["receiver"],
        "originalFilename": row["original_filename"],
        "storedFilename": row["stored_filename"],
        "fileSize": row["file_size"],
        "createdAt": created_at,
        "kind": "file",
        "source": "upload",
        "audioUrl": f"/api/files/{transfer_id}/download",
        "metadata": {},
    }


def send_transfer_file(transfer_row):
    # Serve audio inline for playback in <audio> elements, not as attachment
    return send_from_directory(
        current_app.config["UPLOAD_FOLDER"],
        transfer_row["stored_filename"],
        as_attachment=False,
        download_name=transfer_row["original_filename"],
        mimetype="audio/wav",
    )


def decode_transfer_file(transfer_row) -> dict:
    base_dir = Path(current_app.root_path)
    model_dir = base_dir / "aura-model-v1"
    receiver_script = model_dir / "aura_v2r_receiver.py"
    decoder_ckpt = model_dir / "aura_v2r_decoder_only.pt"
    config_path = model_dir / "aura_v2r_config.json"
    stego_path = Path(current_app.config["UPLOAD_FOLDER"]) / transfer_row["stored_filename"]

    if not receiver_script.exists() or not decoder_ckpt.exists() or not config_path.exists():
        raise RuntimeError("Aura decoder assets are missing from backend/aura-model-v1.")
    if not stego_path.exists():
        raise RuntimeError("Stored WAV file is missing.")

    completed = subprocess.run(
        [
            sys.executable,
            str(receiver_script),
            "--config",
            str(config_path),
            "--weights",
            str(decoder_ckpt),
            "--stego",
            str(stego_path),
        ],
        capture_output=True,
        text=True,
        timeout=120,
        cwd=str(model_dir),
    )

    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip()
        raise RuntimeError(detail or "Aura decode process failed.")

    return {
        "recoveredText": _extract_recovered_text(completed.stdout),
        "rawOutput": completed.stdout,
    }


def _extract_recovered_text(output: str) -> str:
    marker = "Recovered text:"
    if marker not in output:
        return output.strip()

    after_marker = output.split(marker, 1)[1].strip()
    lines = []
    for line in after_marker.splitlines():
        if line.strip().startswith("-" * 8):
            break
        lines.append(line)
    return "\n".join(lines).strip()
