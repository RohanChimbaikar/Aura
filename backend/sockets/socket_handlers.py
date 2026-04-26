from flask import session
from flask_socketio import SocketIO, emit, join_room

from services.auth_service import get_user_by_username
from services.message_service import create_message


socketio = SocketIO(
    async_mode="threading",
    cors_allowed_origins=["http://localhost:5173"],
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
    socketio.emit("file_received", transfer, room=transfer["receiver"])
    socketio.emit("file_received", transfer, room=transfer["sender"])
