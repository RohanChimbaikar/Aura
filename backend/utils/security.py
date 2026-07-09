from functools import wraps
from flask import jsonify, session, g, make_response, current_app
from flask_jwt_extended import (
    verify_jwt_in_request,
    create_access_token,
    create_refresh_token,
    set_access_cookies,
    set_refresh_cookies,
    get_jwt_identity
)
from services.auth_service import get_user_by_username, serialize_user


def get_current_username() -> str | None:
    if "user" in g and g.user:
        return g.user.get("username")
    try:
        identity = get_jwt_identity()
        if identity:
            return identity
    except Exception:
        pass
    return session.get("username")


def authenticate_request() -> None:
    """
    Checks the JWT access token. If expired/invalid but a valid refresh token exists,
    automatically refreshes the session context and marks the request for cookie update.
    """
    if hasattr(g, "user") and g.user:
        return

    g.user = None
    g.jwt_regenerated = False
    g.jwt_identity = None

    # 1. Try to verify the access token from cookies
    try:
        verify_jwt_in_request(optional=False, locations=["cookies"])
        username = get_jwt_identity()
        user = get_user_by_username(username)
        if user:
            g.user = serialize_user(user)
            session["username"] = username
        return
    except Exception:
        pass

    # 2. Try to verify the refresh token from cookies
    try:
        verify_jwt_in_request(optional=False, locations=["cookies"], refresh=True)
        username = get_jwt_identity()
        user = get_user_by_username(username)
        if user:
            g.user = serialize_user(user)
            session["username"] = username
            g.jwt_regenerated = True
            g.jwt_identity = username
    except Exception:
        # Clear session username if unauthenticated
        session.pop("username", None)


def login_required(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        authenticate_request()
        if not g.user:
            return jsonify({"error": "Authentication required."}), 401

        response = view(*args, **kwargs)

        # If token was refreshed on-the-fly, update the client cookies
        if getattr(g, "jwt_regenerated", False) and g.jwt_identity:
            res = make_response(response)
            
            # Generate new access and refresh tokens
            access_token = create_access_token(identity=g.jwt_identity)
            refresh_token = create_refresh_token(identity=g.jwt_identity)
            
            # Set the new cookies in the response
            set_access_cookies(res, access_token)
            set_refresh_cookies(res, refresh_token)
            return res

        return response

    return wrapped_view
