from typing import Optional

from werkzeug.security import check_password_hash, generate_password_hash

from services.db import get_db


DEMO_USERS = (
    ("sender_user", "password123"),
    ("receiver_user", "password123"),
)


def ensure_demo_users() -> None:
    db = get_db()
    for username, password in DEMO_USERS:
        db.execute(
            """
            INSERT INTO users (username, password_hash)
            VALUES (?, ?)
            ON CONFLICT(username) DO NOTHING
            """,
            (username, generate_password_hash(password)),
        )
    db.commit()


def get_user_by_username(username: str):
    db = get_db()
    return db.execute(
        "SELECT id, username, password_hash, created_at FROM users WHERE username = ?",
        (username,),
    ).fetchone()


def authenticate_user(username: str, password: str) -> Optional[dict]:
    user = get_user_by_username(username)
    if not user or not check_password_hash(user["password_hash"], password):
        return None
    return serialize_user(user)


def list_users(exclude_username: str | None = None) -> list[dict]:
    db = get_db()
    if exclude_username:
        rows = db.execute(
            "SELECT id, username, created_at FROM users WHERE username != ? ORDER BY username",
            (exclude_username,),
        ).fetchall()
    else:
        rows = db.execute(
            "SELECT id, username, created_at FROM users ORDER BY username"
        ).fetchall()
    return [serialize_user(row) for row in rows]


def serialize_user(row) -> dict:
    return {
        "id": row["id"],
        "username": row["username"],
        "createdAt": row["created_at"],
    }
