from flask import Blueprint, jsonify, request

from services.auth_service import get_user_by_username
from services.file_service import (
    decode_transfer_file,
    get_transfer_by_id,
    list_accessible_transfers,
    save_uploaded_transfer,
    send_transfer_file,
)
from sockets.socket_handlers import emit_file_received
from utils.security import get_current_username, login_required


file_bp = Blueprint("files", __name__)


@file_bp.get("")
@login_required
def list_files():
    username = get_current_username()
    direction = request.args.get("direction")
    return jsonify({"files": list_accessible_transfers(username, direction)})


@file_bp.post("/upload")
@login_required
def upload_file():
    sender = get_current_username()
    receiver = (request.form.get("receiver") or "").strip()
    file_storage = request.files.get("file")

    if not receiver:
        return jsonify({"error": "Receiver is required."}), 400
    if get_user_by_username(receiver) is None:
        return jsonify({"error": "Receiver does not exist."}), 404
    if file_storage is None:
        return jsonify({"error": "WAV file is required."}), 400

    try:
        transfer = save_uploaded_transfer(file_storage, sender, receiver)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    emit_file_received(transfer)
    return jsonify({"file": transfer}), 201


@file_bp.get("/<int:transfer_id>/download")
@login_required
def download_file(transfer_id: int):
    transfer = get_transfer_by_id(transfer_id)
    if transfer is None:
        return jsonify({"error": "File not found."}), 404

    username = get_current_username()
    if username not in {transfer["sender"], transfer["receiver"]}:
        return jsonify({"error": "Not authorized to access this file."}), 403

    return send_transfer_file(transfer)


@file_bp.post("/<int:transfer_id>/decode")
@login_required
def decode_file(transfer_id: int):
    transfer = get_transfer_by_id(transfer_id)
    if transfer is None:
        return jsonify({"error": "File not found."}), 404

    username = get_current_username()
    if username not in {transfer["sender"], transfer["receiver"]}:
        return jsonify({"error": "Not authorized to decode this file."}), 403

    try:
        result = decode_transfer_file(transfer)
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 500

    return jsonify(result)
