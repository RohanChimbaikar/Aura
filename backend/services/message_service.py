from services.db import get_db


def create_message(sender: str, receiver: str, content: str) -> dict:
    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO messages (sender, receiver, content)
        VALUES (?, ?, ?)
        """,
        (sender, receiver, content),
    )
    db.commit()
    row = db.execute(
        """
        SELECT id, sender, receiver, content, created_at
        FROM messages
        WHERE id = ?
        """,
        (cursor.lastrowid,),
    ).fetchone()
    return serialize_message(row)


def get_conversation(user_a: str, user_b: str) -> list[dict]:
    db = get_db()
    rows = db.execute(
        """
        SELECT id, sender, receiver, content, created_at
        FROM messages
        WHERE (sender = ? AND receiver = ?)
           OR (sender = ? AND receiver = ?)
        ORDER BY datetime(created_at) ASC, id ASC
        """,
        (user_a, user_b, user_b, user_a),
    ).fetchall()
    return [serialize_message(row) for row in rows]


def serialize_message(row) -> dict:
    return {
        "id": row["id"],
        "sender": row["sender"],
        "receiver": row["receiver"],
        "content": row["content"],
        "createdAt": row["created_at"],
        "kind": "text",
    }
