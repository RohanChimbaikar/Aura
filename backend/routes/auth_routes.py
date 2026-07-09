from flask import Blueprint, jsonify, request, session, current_app, g
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    set_access_cookies,
    set_refresh_cookies,
    unset_jwt_cookies,
    jwt_required,
    get_jwt_identity,
    verify_jwt_in_request
)

from services.auth_service import (
    authenticate_user,
    create_email_user,
    ensure_demo_users,
    list_users,
    verify_google_token,
    upsert_google_user,
    generate_reset_token,
    reset_password_with_token,
    get_user_by_username,
    serialize_user
)
from utils.security import get_current_username, login_required, authenticate_request
from utils.limiter import limiter

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/register")
@limiter.limit("5 per minute")
def register():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip()
    password = payload.get("password") or ""
    confirm_password = payload.get("confirmPassword") or ""

    if not name or not email or not password or not confirm_password:
        return jsonify({"error": "All fields are required."}), 400

    if password != confirm_password:
        return jsonify({"error": "Passwords do not match."}), 400

    user, message = create_email_user(name, email, password)
    if user is None:
        return jsonify({"error": message}), 400

    # Auto-login after successful registration
    access_token = create_access_token(identity=user["username"])
    refresh_token = create_refresh_token(identity=user["username"])

    session.clear()
    session["username"] = user["username"]

    res = jsonify({"user": user, "message": "Registration successful."})
    set_access_cookies(res, access_token)
    set_refresh_cookies(res, refresh_token)
    return res, 201


@auth_bp.post("/login")
@limiter.limit("5 per minute")
def login():
    ensure_demo_users()
    payload = request.get_json(silent=True) or {}
    username_or_email = (payload.get("username") or payload.get("email") or "").strip()
    password = payload.get("password") or ""
    remember_me = bool(payload.get("rememberMe"))

    if not username_or_email or not password:
        return jsonify({"error": "Username/Email and password are required."}), 400

    user = authenticate_user(username_or_email, password)
    if user is None:
        return jsonify({"error": "Invalid credentials."}), 401

    access_token = create_access_token(identity=user["username"])
    refresh_token = create_refresh_token(identity=user["username"])

    session.clear()
    session["username"] = user["username"]

    res = jsonify({"user": user})
    if remember_me:
        set_access_cookies(res, access_token)
        set_refresh_cookies(res, refresh_token)
    else:
        # Set session-scoped cookies that expire when browser closes
        set_access_cookies(res, access_token, max_age=None)
        set_refresh_cookies(res, refresh_token, max_age=None)
        
    return res


@auth_bp.post("/google")
@limiter.limit("10 per minute")
def google_auth():
    payload = request.get_json(silent=True) or {}
    credential = payload.get("credential")

    if not credential:
        return jsonify({"error": "Google credential token is required."}), 400

    client_id = current_app.config.get("GOOGLE_CLIENT_ID")
    if not client_id:
        return jsonify({"error": "Google Client ID is not configured on backend."}), 500

    idinfo = verify_google_token(credential, client_id)
    if not idinfo:
        return jsonify({"error": "Google verification failed."}), 401

    user = upsert_google_user(idinfo)

    access_token = create_access_token(identity=user["username"])
    refresh_token = create_refresh_token(identity=user["username"])

    session.clear()
    session["username"] = user["username"]

    res = jsonify({"user": user})
    # Google Sign-in remembers users by default
    set_access_cookies(res, access_token)
    set_refresh_cookies(res, refresh_token)
    return res


@auth_bp.post("/forgot-password")
@limiter.limit("3 per hour")
def forgot_password():
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip()

    if not email:
        return jsonify({"error": "Email is required."}), 400

    token = generate_reset_token(email)
    
    # We return success regardless of email existence to prevent user enumeration attacks
    return jsonify({
        "success": True, 
        "message": "If this email exists in our records, a reset link has been generated."
    })


@auth_bp.post("/reset-password")
@limiter.limit("5 per minute")
def reset_password():
    payload = request.get_json(silent=True) or {}
    token = payload.get("token")
    new_password = payload.get("password")

    if not token or not new_password:
        return jsonify({"error": "Token and password are required."}), 400

    success, message = reset_password_with_token(token, new_password)
    if not success:
        return jsonify({"error": message}), 400

    return jsonify({"success": True, "message": message})


@auth_bp.post("/logout")
def logout():
    session.clear()
    res = jsonify({"success": True})
    unset_jwt_cookies(res)
    return res


@auth_bp.get("/session")
def session_status():
    ensure_demo_users()
    authenticate_request()
    
    if not g.user:
        return jsonify({"authenticated": False, "user": None})

    return jsonify({"authenticated": True, "user": g.user})


@auth_bp.get("/me")
@login_required
def get_me():
    return jsonify({"user": g.user})


@auth_bp.post("/change-password")
@login_required
@limiter.limit("5 per minute")
def change_password():
    from services.db import get_db
    from services.auth_service import check_password, hash_password, validate_password_strength

    payload = request.get_json(silent=True) or {}
    current_pwd = payload.get("currentPassword") or ""
    new_pwd = payload.get("newPassword") or ""
    
    if not current_pwd or not new_pwd:
        return jsonify({"error": "Current and new passwords are required."}), 400
        
    db = get_db()
    user = db.execute("SELECT password_hash, google_id FROM users WHERE id = ?", (g.user["id"],)).fetchone()
    
    if not user:
        return jsonify({"error": "User not found."}), 404
        
    if user["google_id"]:
        return jsonify({"error": "Google accounts cannot change passwords locally."}), 400
        
    if not check_password(user["password_hash"], current_pwd):
        return jsonify({"error": "Incorrect current password."}), 400
        
    is_strong, msg = validate_password_strength(new_pwd)
    if not is_strong:
        return jsonify({"error": msg}), 400
        
    hashed = hash_password(new_pwd)
    db.execute(
        "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (hashed, g.user["id"])
    )
    db.commit()
    
    return jsonify({"success": True, "message": "Password changed successfully."})
