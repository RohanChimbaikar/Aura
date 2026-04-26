from flask import Blueprint, jsonify

from services.auth_service import ensure_demo_users, list_users
from services.message_service import get_conversation
from utils.security import get_current_username, login_required


chat_bp = Blueprint("chat", __name__)


@chat_bp.get("/users")
@login_required
def users():
    ensure_demo_users()
    return jsonify({"users": list_users(exclude_username=get_current_username())})


@chat_bp.get("/history/<other_username>")
@login_required
def history(other_username: str):
    current_username = get_current_username()
    return jsonify(
        {
            "messages": get_conversation(current_username, other_username),
        }
    )
