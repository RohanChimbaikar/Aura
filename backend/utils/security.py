from functools import wraps

from flask import jsonify, session


def get_current_username() -> str | None:
    return session.get("username")


def login_required(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        if get_current_username() is None:
            return jsonify({"error": "Authentication required."}), 401
        return view(*args, **kwargs)

    return wrapped_view
