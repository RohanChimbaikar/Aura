from flask import session
from flask_socketio import SocketIO, emit, join_room
import sys

from services.auth_service import get_user_by_username
from services.file_service import utc_iso_timestamp
from services.message_service import create_message


socketio = SocketIO(
    async_mode="threading",
    cors_allowed_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    manage_session=False,
)


def init_socketio(app) -> None:
    socketio.init_app(app)


@socketio.on("connect")
def handle_connect():
    username = session.get("username")
    if not username:
        return False

    join_room(username)
    print(f"[socket] connected username={username} joined room={username}", file=sys.stderr)
    emit("presence", {"username": username, "status": "online"})


@socketio.on("send_message")
def handle_send_message(payload):
    username = session.get("username")
    if not username:
        emit("chat_error", {"error": "Unauthorized."})
        return

    receiver = (payload or {}).get("receiver", "").strip()
    content = ((payload or {}).get("content") or "").strip()

    if not receiver or not content:
        emit("chat_error", {"error": "Receiver and content are required."})
        return
    if get_user_by_username(receiver) is None:
        emit("chat_error", {"error": "Receiver does not exist."})
        return

    message = create_message(username, receiver, content)
    socketio.emit("new_message", message, room=receiver)
    socketio.emit("new_message", message, room=username)


def emit_file_received(transfer: dict) -> None:
    sender = transfer.get("sender")
    receiver = transfer.get("receiver")
    transfer_id = transfer.get("id")

    if not sender or not receiver:
        print(f"[socket] invalid transfer payload, missing sender/receiver: {transfer}", file=sys.stderr)
        return

    raw_created = transfer.get("createdAt") or transfer.get("created_at")
    message_id = transfer.get("messageId") or transfer.get("message_id")
    if not message_id and transfer_id is not None:
        message_id = str(transfer_id)

    payload = {
        "id": transfer_id,
        "messageId": message_id,
        "sender": sender,
        "receiver": receiver,
        "audioUrl": transfer.get("audioUrl") or transfer.get("audio_url"),
        "originalFilename": transfer.get("originalFilename") or transfer.get("original_filename"),
        "createdAt": utc_iso_timestamp(raw_created),
        "fileSize": transfer.get("fileSize") or transfer.get("file_size") or 0,
        "metadata": transfer.get("metadata") or {},
        "source": transfer.get("source", "upload"),
    }

    print(f"[socket] emitting file_received to receiver={receiver} id={transfer_id}", file=sys.stderr)
    socketio.emit("file_received", payload, room=receiver)

    print(f"[socket] emitting file_received to sender={sender} id={transfer_id}", file=sys.stderr)
    socketio.emit("file_received", payload, room=sender)


def emit_aura_chat_message(message: dict) -> None:
    """Notify both parties when an Aura / encode chat message is persisted (JSON store)."""
    sender = str(message.get("sender") or "").strip()
    receiver = str(message.get("receiver") or "").strip()
    mid = message.get("id")
    if not sender or not receiver:
        print(
            f"[socket] aura_chat_message skipped (missing sender/receiver): id={mid}",
            file=sys.stderr,
        )
        return

    print(
        f"[socket] emitting aura_chat_message id={mid} to sender={sender} receiver={receiver}",
        file=sys.stderr,
    )
    socketio.emit("aura_chat_message", message, room=receiver)
    socketio.emit("aura_chat_message", message, room=sender)