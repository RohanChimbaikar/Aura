import os
import time
import uuid
from pathlib import Path

# Important: Set Matplotlib to 'Agg' backend so it doesn't crash Flask's threads
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import librosa
import librosa.display

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
from sockets.socket_handlers import emit_aura_chat_message

aura_bp = Blueprint("aura", __name__)


def generate_comparative_spectrograms(cover_path: Path, stego_path: Path, base_filename: str):
    """
    Generates Cover, Stego, and Residual difference spectrograms 
    and saves them as 3 separate images to the OUTPUT_DIR.
    """
    try:
        # 1. Load Audio
        cover, sr = librosa.load(cover_path, sr=None)
        stego, _ = librosa.load(stego_path, sr=sr)

        # Ensure arrays are exactly the same length for subtraction
        min_len = min(len(cover), len(stego))
        cover = cover[:min_len]
        stego = stego[:min_len]

        # 2. Isolate the steganographic payload (The Residual)
        residual = stego - cover

        # 3. Compute STFT matrices
        n_fft = 2048
        hop_length = 512
        D_cover = librosa.stft(cover, n_fft=n_fft, hop_length=hop_length)
        D_stego = librosa.stft(stego, n_fft=n_fft, hop_length=hop_length)
        D_residual = librosa.stft(residual, n_fft=n_fft, hop_length=hop_length)

        # 4. Convert to dB scale
        DB_cover = librosa.amplitude_to_db(np.abs(D_cover), ref=np.max)
        DB_stego = librosa.amplitude_to_db(np.abs(D_stego), ref=np.max)
        DB_residual = librosa.amplitude_to_db(np.abs(D_residual), ref=np.max)

        # 5. Helper function to save individual plots without whitespace

        def save_plot(matrix, cmap, filename):
            # CHANGED: 18x4 gives us an ultra-wide aspect ratio perfect for full-screen bars
            plt.figure(figsize=(18, 4)) 
            librosa.display.specshow(matrix, sr=sr, hop_length=hop_length, x_axis='time', y_axis='hz', cmap=cmap)
            plt.axis('off') 
            plt.tight_layout(pad=0)
            
            filepath = OUTPUT_DIR / filename
            # CHANGED: Cranked DPI to 300 for crystal clear high-resolution rendering
            plt.savefig(filepath, dpi=300, bbox_inches='tight', pad_inches=0) 
            plt.close('all')
            return f"/outputs/{filename}"

        # Generate and save all 3 images
        cover_url = save_plot(DB_cover, 'magma', f"cover_{base_filename}.png")
        stego_url = save_plot(DB_stego, 'magma', f"stego_{base_filename}.png")
        diff_url = save_plot(DB_residual, 'inferno', f"diff_{base_filename}.png")

        return {
            "coverImageUrl": cover_url,
            "stegoImageUrl": stego_url,
            "diffImageUrl": diff_url
        }
    except Exception as e:
        print(f"Spectrogram Generation Failed: {e}")
        return None


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
    saved = add_message(payload)
    emit_aura_chat_message(saved)
    return jsonify(saved), 201


@aura_bp.get("/messages/<message_id>/analysis")
def message_analysis(message_id: str):
    """
    Simple direct analysis route by message id.
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
    """
    payload = request.get_json(silent=True) or {}

    message_id = payload.get("messageId") or payload.get("message_id") or ""
    source_type = payload.get("sourceType") or payload.get("source_type")
    transmission_id = payload.get("transmissionId") or payload.get("transmission_id")
    selected_part_number = payload.get("selectedPartNumber") or payload.get("selected_part_number")
    selected_part_filename = payload.get("selectedPartFilename") or payload.get("selected_part_filename")
    audio_url = payload.get("audioUrl") or payload.get("audio_url")
    file_name = payload.get("fileName") or payload.get("file_name")
    total_parts = payload.get("totalParts") or payload.get("total_parts")

    # SIMULATION REMOVED FROM PARSING HERE

    message_id = str(message_id).strip() if message_id is not None else ""

    if not message_id and not transmission_id and not audio_url and not file_name:
        return jsonify(
            {
                "success": False,
                "error": "messageId/message_id, transmissionId/transmission_id, audioUrl/audio_url, or fileName/file_name is required.",
            }
        ), 400

    try:
        # 1. Run Standard Core Analysis
        result = analyze_message(
            message_id=message_id or None,
            source_type=source_type,
            transmission_id=transmission_id,
            selected_part_number=selected_part_number,
            selected_part_filename=selected_part_filename,
            audio_url=audio_url,
            file_name=file_name,
            total_parts=total_parts,
            # No simulation passed
        )

        # 2. Spectrogram Generation Pipeline
        # Resolve the paths for the stego and cover audio
        stego_path = None
        if audio_url and audio_url.startswith("/outputs/"):
            stego_path = OUTPUT_DIR / Path(audio_url).name
        elif file_name:
            stego_path = OUTPUT_DIR / file_name

        if stego_path and stego_path.exists():
            # In a real environment, you would fetch the specific cover path associated with this message_id.
            # For this pipeline, we will look for a matching 'cover_X.wav' or default to the stego path 
            # if no cover is found (so the backend doesn't crash).
            cover_path = UPLOAD_DIR / f"cover_{message_id}.wav"
            
            # If we don't have the original cover, we gracefully skip diffing.
            if cover_path.exists():
                unique_id = uuid.uuid4().hex[:8]
                
                spectrogram_urls = generate_comparative_spectrograms(
                    cover_path=cover_path,
                    stego_path=stego_path,
                    base_filename=f"{message_id}_{unique_id}"
                )

                if spectrogram_urls:
                    # Inject the generated image URLs into the JSON response for React
                    if "charts" not in result:
                        result["charts"] = {}
                    
                    result["charts"]["compareSpectrogram"] = {
                        "available": True,
                        **spectrogram_urls
                    }

        return jsonify(result)

    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@aura_bp.get("/outputs/<path:filename>")
def output_file(filename: str):
    return send_from_directory(OUTPUT_DIR, filename)