from pathlib import Path
import time

from flask import Blueprint, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

from services.aura_service import (
    OUTPUT_DIR,
    UPLOAD_DIR,
    add_message,
    analyze_message,
    capacity_for_text,
    decode_audio_path,
    decode_audio_paths,
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
        # Multipart upload path (manual reveal upload)
        if request.content_type and request.content_type.startswith("multipart/form-data"):
            files = request.files.getlist("files")
            if not files:
                primary = request.files.get("file") or request.files.get("audio")
                if primary is not None:
                    files = [primary]

            files = [file for file in files if file and file.filename]
            if not files:
                return jsonify({"success": False, "error": "WAV file is required."}), 400

            if any(not file.filename.lower().endswith(".wav") for file in files):
                return jsonify({"success": False, "error": "Only WAV files are supported."}), 400

            UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
            saved_paths = []

            for file in files:
                filename = secure_filename(file.filename)
                path = UPLOAD_DIR / filename
                file.save(path)
                saved_paths.append(path)

            if len(saved_paths) == 1:
                return jsonify(decode_audio_path(saved_paths[0]))

            return jsonify(decode_audio_paths(saved_paths))

        # JSON path (chat/reveal initiated)
        payload = request.get_json(silent=True) or {}
        message_id = payload.get("message_id") or payload.get("messageId")
        audio_url = payload.get("audio_url") or payload.get("audioUrl") or ""
        segments = payload.get("segments") or []

        # Direct single output file decode
        if isinstance(audio_url, str) and audio_url.startswith("/outputs/"):
            path = OUTPUT_DIR / Path(audio_url).name
            if not path.exists():
                return jsonify(
                    {
                        "success": False,
                        "error": "Audio file not found.",
                        "missing_file": path.name,
                    }
                ), 404
            return jsonify(decode_audio_path(path, message_id=str(message_id) if message_id else None))

        # Grouped decode from provided segment list
        if isinstance(segments, list) and segments:
            segment_paths = []
            missing_files = []

            for segment in segments:
                seg_url = (
                    (segment or {}).get("audio_url")
                    or (segment or {}).get("audioUrl")
                    or ""
                )
                if not isinstance(seg_url, str) or not seg_url.startswith("/outputs/"):
                    return jsonify({"success": False, "error": "Invalid segment audio_url."}), 400

                seg_path = OUTPUT_DIR / Path(seg_url).name
                if not seg_path.exists():
                    missing_files.append(seg_path.name)

                segment_paths.append(seg_path)

            if missing_files:
                return jsonify(
                    {
                        "success": False,
                        "error": "Audio file not found.",
                        "missing_files": missing_files,
                    }
                ), 404

            return jsonify(decode_audio_paths(segment_paths))

        # Decode by message_id fallback
        if message_id:
            message_id = str(message_id).strip()
            path = OUTPUT_DIR / f"{message_id}.wav"

            if not path.exists() and message_id.isdigit():
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

            if not path.exists():
                return jsonify(
                    {
                        "success": False,
                        "error": "Audio file not found.",
                        "missing_file": path.name,
                    }
                ), 404

            return jsonify(decode_audio_path(path, message_id=message_id))

        return jsonify(
            {
                "success": False,
                "error": "audio_url, segments, message_id, or WAV upload is required.",
            }
        ), 400

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
    """
    Simple direct analysis route by message id.
    Useful for older flows and direct navigation.
    """
    try:
        return jsonify(
            analyze_message(
                message_id=message_id,
            )
        )
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@aura_bp.post("/analysis")
def analysis_from_target():
    """
    Main Analysis endpoint.

    Supports BOTH:
    - old snake_case payloads
    - new camelCase payloads from frontend

    Critical:
    - If totalParts > 1, backend grouped semantics must be preserved.
    - This route must forward ALL grouped context into analyze_message(...).
    """
    payload = request.get_json(silent=True) or {}

    # Accept both camelCase and snake_case
    message_id = (
        payload.get("messageId")
        or payload.get("message_id")
        or ""
    )
    source_type = (
        payload.get("sourceType")
        or payload.get("source_type")
    )
    transmission_id = (
        payload.get("transmissionId")
        or payload.get("transmission_id")
    )
    selected_part_number = (
        payload.get("selectedPartNumber")
        or payload.get("selected_part_number")
    )
    selected_part_filename = (
        payload.get("selectedPartFilename")
        or payload.get("selected_part_filename")
    )
    audio_url = (
        payload.get("audioUrl")
        or payload.get("audio_url")
    )
    file_name = (
        payload.get("fileName")
        or payload.get("file_name")
    )
    total_parts = (
        payload.get("totalParts")
        or payload.get("total_parts")
    )

    message_id = str(message_id).strip() if message_id is not None else ""

    # We allow analysis by:
    # - messageId
    # - transmissionId
    # - audioUrl/fileName
    # so don't hard fail only on messageId.
    if not message_id and not transmission_id and not audio_url and not file_name:
        return jsonify(
            {
                "success": False,
                "error": "messageId/message_id, transmissionId/transmission_id, audioUrl/audio_url, or fileName/file_name is required.",
            }
        ), 400

    try:
        result = analyze_message(
            message_id=message_id or None,
            source_type=source_type,
            transmission_id=transmission_id,
            selected_part_number=selected_part_number,
            selected_part_filename=selected_part_filename,
            audio_url=audio_url,
            file_name=file_name,
            total_parts=total_parts,
        )
        return jsonify(result)

    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@aura_bp.get("/outputs/<path:filename>")
def output_file(filename: str):
    return send_from_directory(OUTPUT_DIR, filename)