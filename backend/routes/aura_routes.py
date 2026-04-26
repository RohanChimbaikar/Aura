from pathlib import Path
import time
import uuid

from flask import Blueprint, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

from services.aura_service import (
    OUTPUT_DIR,
    UPLOAD_DIR,
    add_message,
    analysis_for_message,
    capacity_for_text,
    decode_audio_path,
    encode_text,
    load_messages,
)
from services.db import get_db

aura_bp = Blueprint("aura", __name__)


@aura_bp.post("/encode/preview")
def encode_preview():
    payload = request.get_json(silent=True) or {}
    text = payload.get("text", "")
    try:
        return jsonify(capacity_for_text(text))
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 400


@aura_bp.post("/encode")
def encode():
    payload = request.get_json(silent=True) or {}
    text = (payload.get("text") or "").strip()
    if not text:
        return jsonify({"success": False, "error": "Secret message is required."}), 400
    try:
        return jsonify(encode_text(text))
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@aura_bp.post("/decode")
def decode():
    try:
        if request.content_type and request.content_type.startswith("multipart/form-data"):
            file = request.files.get("file") or request.files.get("audio")
            if file is None or not file.filename:
                return jsonify({"success": False, "error": "WAV file is required."}), 400
            if not file.filename.lower().endswith(".wav"):
                return jsonify({"success": False, "error": "Only WAV files are supported."}), 400
            UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
            filename = f"{uuid.uuid4().hex[:10]}_{secure_filename(file.filename)}"
            path = UPLOAD_DIR / filename
            file.save(path)
            return jsonify(decode_audio_path(path))

        payload = request.get_json(silent=True) or {}
        message_id = payload.get("message_id")
        audio_url = payload.get("audio_url", "")
        if message_id:
            path = OUTPUT_DIR / f"{message_id}.wav"
            if not path.exists() and str(message_id).isdigit():
                transfer = get_db().execute(
                    """
                    SELECT stored_filename
                    FROM audio_transfers
                    WHERE id = ?
                    """,
                    (int(message_id),),
                ).fetchone()
                if transfer is not None:
                    path = UPLOAD_DIR / transfer["stored_filename"]
        elif audio_url.startswith("/outputs/"):
            path = OUTPUT_DIR / Path(audio_url).name
            message_id = path.stem
        else:
            return jsonify({"success": False, "error": "message_id or WAV upload is required."}), 400
        return jsonify(decode_audio_path(path, message_id=message_id))
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@aura_bp.get("/messages")
def messages():
    return jsonify({"messages": load_messages()})


@aura_bp.post("/messages")
def create_message():
    payload = request.get_json(silent=True) or {}
    payload.setdefault("createdAt", time.strftime("%Y-%m-%dT%H:%M:%S"))
    return jsonify(add_message(payload)), 201


@aura_bp.get("/messages/<message_id>/analysis")
def message_analysis(message_id: str):
    return jsonify(analysis_for_message(message_id))


@aura_bp.get("/outputs/<filename>")
def output_file(filename: str):
    return send_from_directory(OUTPUT_DIR, filename)
