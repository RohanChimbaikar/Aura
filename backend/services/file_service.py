from pathlib import Path
import subprocess
import sys
from uuid import uuid4

from flask import current_app, send_from_directory
from werkzeug.utils import secure_filename

from services.db import get_db


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
    return {
        "id": row["id"],
        "sender": row["sender"],
        "receiver": row["receiver"],
        "originalFilename": row["original_filename"],
        "storedFilename": row["stored_filename"],
        "fileSize": row["file_size"],
        "createdAt": row["created_at"],
        "kind": "file",
    }


def send_transfer_file(transfer_row):
    return send_from_directory(
        current_app.config["UPLOAD_FOLDER"],
        transfer_row["stored_filename"],
        as_attachment=True,
        download_name=transfer_row["original_filename"],
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
