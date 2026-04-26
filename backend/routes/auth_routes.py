from flask import Blueprint, jsonify, request, session

from services.auth_service import authenticate_user, ensure_demo_users, list_users
from utils.security import get_current_username, login_required


auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/login")
def login():
    ensure_demo_users()
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""

    user = authenticate_user(username, password)
    if user is None:
        return jsonify({"error": "Invalid username or password."}), 401

    session.clear()
    session["username"] = user["username"]
    return jsonify({"user": user})


@auth_bp.post("/logout")
@login_required
def logout():
    session.clear()
    return jsonify({"success": True})


@auth_bp.get("/session")
def session_status():
    ensure_demo_users()
    username = get_current_username()
    if not username:
        return jsonify({"authenticated": False, "user": None})

    users = list_users()
    user = next((item for item in users if item["username"] == username), None)
    return jsonify({"authenticated": True, "user": user})
