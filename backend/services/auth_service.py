import datetime
import re
import secrets
import smtplib
import uuid
from email.mime.text import MIMEText
from typing import Optional

import bcrypt
from flask import current_app
from werkzeug.security import check_password_hash as check_pbkdf2_hash

from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from services.db import get_db

DEMO_USERS = (
    ("sender_user", "password123"),
    ("receiver_user", "password123"),
)


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def check_password(password_hash: str, password: str) -> bool:
    if not password_hash:
        return False
    # Backward compatibility with Werkzeug PBKDF2 hashes
    if password_hash.startswith("pbkdf2:"):
        return check_pbkdf2_hash(password_hash, password)
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


def validate_password_strength(password: str) -> tuple[bool, str]:
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter."
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter."
    if not re.search(r"\d", password):
        return False, "Password must contain at least one number."
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return False, "Password must contain at least one special character."
    return True, "Password is strong."


def ensure_demo_users() -> None:
    db = get_db()
    for username, password in DEMO_USERS:
        user = db.execute("SELECT id, password_hash, email FROM users WHERE username = ?", (username,)).fetchone()
        email = f"{username}@aura.ai"
        name = "Demo Sender" if username == "sender_user" else "Demo Receiver"
        hashed = hash_password(password)
        if not user:
            db.execute(
                """
                INSERT INTO users (username, email, name, password_hash)
                VALUES (?, ?, ?, ?)
                """,
                (username, email, name, hashed),
            )
        else:
            # Upgrade existing records to make sure email, name are set
            db.execute(
                """
                UPDATE users
                SET email = COALESCE(email, ?),
                    name = COALESCE(name, ?)
                WHERE username = ?
                """,
                (email, name, username),
            )
    db.commit()


def get_user_by_username(username: str):
    db = get_db()
    return db.execute(
        "SELECT id, username, email, name, password_hash, google_id, profile_picture, created_at, updated_at, last_login FROM users WHERE username = ?",
        (username,),
    ).fetchone()


def get_user_by_email(email: str):
    db = get_db()
    return db.execute(
        "SELECT id, username, email, name, password_hash, google_id, profile_picture, created_at, updated_at, last_login FROM users WHERE email = ?",
        (email,),
    ).fetchone()


def get_user_by_id(user_id: int):
    db = get_db()
    return db.execute(
        "SELECT id, username, email, name, password_hash, google_id, profile_picture, created_at, updated_at, last_login FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()


def authenticate_user(username_or_email: str, password: str) -> Optional[dict]:
    # Check if they logged in with email or username
    if "@" in username_or_email:
        user = get_user_by_email(username_or_email)
    else:
        user = get_user_by_username(username_or_email)
        
    if not user or not check_password(user["password_hash"], password):
        return None
        
    # Upgrade pbkdf2 hash to bcrypt on successful login if found
    if user["password_hash"].startswith("pbkdf2:"):
        db = get_db()
        new_hash = hash_password(password)
        db.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (new_hash, user["id"]),
        )
        db.commit()
        # Fetch fresh record
        user = get_user_by_id(user["id"])
        
    # Update last login
    db = get_db()
    db.execute("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", (user["id"],))
    db.commit()
    
    return serialize_user(user)


def create_email_user(name: str, email: str, password: str) -> tuple[Optional[dict], str]:
    db = get_db()
    email = email.strip().lower()
    name = name.strip()
    
    # 1. Validate email format
    if not re.match(r"[^@]+@[^@]+\.[^@]+", email):
        return None, "Invalid email address format."
        
    # 2. Enforce strong password
    is_strong, strength_msg = validate_password_strength(password)
    if not is_strong:
        return None, strength_msg
        
    # 3. Check for duplicate accounts
    existing_email = get_user_by_email(email)
    if existing_email:
        return None, "An account with this email already exists."
        
    username = email.split("@")[0]
    existing_username = get_user_by_username(username)
    if existing_username:
        # Append unique characters if username prefix is taken
        username = f"{username}_{uuid.uuid4().hex[:4]}"
        
    # 4. Hash password and insert
    hashed = hash_password(password)
    try:
        db.execute(
            """
            INSERT INTO users (username, email, name, password_hash)
            VALUES (?, ?, ?, ?)
            """,
            (username, email, name, hashed),
        )
        db.commit()
    except Exception as e:
        return None, f"Database error during registration: {str(e)}"
        
    user = get_user_by_email(email)
    return serialize_user(user), "Registration successful."


def verify_google_token(id_token_str: str, client_id: str) -> dict | None:
    try:
        idinfo = id_token.verify_oauth2_token(
            id_token_str,
            google_requests.Request(),
            client_id
        )
        return idinfo
    except Exception as e:
        import sys
        print(f"[google oauth error] Verification failed: {e}", file=sys.stderr)
        return None


def upsert_google_user(idinfo: dict) -> dict:
    db = get_db()
    google_id = idinfo.get("sub")
    email = idinfo.get("email")
    name = idinfo.get("name") or (email.split("@")[0] if email else "Google User")
    picture = idinfo.get("picture")
    
    # 1. Find by google_id
    user = db.execute("SELECT * FROM users WHERE google_id = ?", (google_id,)).fetchone()
    
    if not user and email:
        # 2. Find by email
        user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if user:
            # Link existing account to Google
            db.execute(
                """
                UPDATE users
                SET google_id = ?,
                    profile_picture = COALESCE(profile_picture, ?),
                    name = COALESCE(name, ?),
                    last_login = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (google_id, picture, name, user["id"])
            )
            db.commit()
            user = db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
            
    if not user:
        # 3. Create new user
        username = email.split("@")[0] if email else f"google_{google_id[:8]}"
        existing = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        if existing:
            username = f"{username}_{uuid.uuid4().hex[:4]}"
            
        random_pwd = uuid.uuid4().hex
        pwd_hash = hash_password(random_pwd)
        
        db.execute(
            """
            INSERT INTO users (username, email, name, password_hash, google_id, profile_picture, last_login)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (username, email, name, pwd_hash, google_id, picture)
        )
        db.commit()
        user = db.execute("SELECT * FROM users WHERE google_id = ?", (google_id,)).fetchone()
    else:
        # Update last login and profile picture
        db.execute(
            """
            UPDATE users
            SET last_login = CURRENT_TIMESTAMP,
                profile_picture = ?
            WHERE id = ?
            """,
            (picture, user["id"])
        )
        db.commit()
        user = db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
        
    return serialize_user(user)


def generate_reset_token(email: str) -> str | None:
    db = get_db()
    email = email.strip().lower()
    user = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if not user:
        return None
        
    token = secrets.token_urlsafe(32)
    # Expires in 1 hour
    expires_at = (datetime.datetime.utcnow() + datetime.timedelta(hours=1)).isoformat()
    
    # Store token in password_resets
    db.execute(
        """
        INSERT INTO password_resets (email, token, expires_at)
        VALUES (?, ?, ?)
        """,
        (email, token, expires_at)
    )
    db.commit()
    
    # Try sending email
    smtp_host = current_app.config.get("SMTP_HOST")
    smtp_port = current_app.config.get("SMTP_PORT")
    smtp_user = current_app.config.get("SMTP_USER")
    smtp_password = current_app.config.get("SMTP_PASSWORD")
    smtp_sender = current_app.config.get("SMTP_SENDER") or "noreply@aura.ai"
    
    frontend_url = current_app.config.get("FRONTEND_URL") or "http://localhost:5173"
    reset_link = f"{frontend_url}/?token={token}"
    
    body = f"""Hello,

You requested a password reset for your Aura account.
Please click the link below to reset your password (valid for 1 hour):

{reset_link}

If you did not request this, please ignore this email.
"""
    
    msg = MIMEText(body)
    msg["Subject"] = "Aura Steganography Password Reset"
    msg["From"] = smtp_sender
    msg["To"] = email
    
    import sys
    print(f"\n[PASSWORD RESET EMAIL] Sent to: {email}\nLink: {reset_link}\n", file=sys.stderr)
    
    if smtp_host and smtp_port and smtp_user and smtp_password:
        try:
            with smtplib.SMTP(smtp_host, int(smtp_port)) as server:
                server.starttls()
                server.login(smtp_user, smtp_password)
                server.sendmail(smtp_sender, [email], msg.as_string())
        except Exception as e:
            print(f"[email warning] Failed to send email via SMTP: {e}", file=sys.stderr)
            
    return token


def reset_password_with_token(token: str, new_password: str) -> tuple[bool, str]:
    db = get_db()
    reset = db.execute(
        "SELECT email, expires_at FROM password_resets WHERE token = ?",
        (token,)
    ).fetchone()
    
    if not reset:
        return False, "Invalid or expired reset token."
        
    expires_at = datetime.datetime.fromisoformat(reset["expires_at"])
    if expires_at < datetime.datetime.utcnow():
        db.execute("DELETE FROM password_resets WHERE token = ?", (token,))
        db.commit()
        return False, "Reset token has expired."
        
    email = reset["email"]
    
    is_strong, msg = validate_password_strength(new_password)
    if not is_strong:
        return False, msg
        
    hashed = hash_password(new_password)
    db.execute(
        "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?",
        (hashed, email)
    )
    db.execute("DELETE FROM password_resets WHERE email = ?", (email,))
    db.commit()
    
    return True, "Password has been reset successfully."


def list_users(exclude_username: str | None = None) -> list[dict]:
    db = get_db()
    if exclude_username:
        rows = db.execute(
            "SELECT id, username, email, name, google_id, profile_picture, created_at, updated_at, last_login FROM users WHERE username != ? ORDER BY username",
            (exclude_username,),
        ).fetchall()
    else:
        rows = db.execute(
            "SELECT id, username, email, name, google_id, profile_picture, created_at, updated_at, last_login FROM users ORDER BY username"
        ).fetchall()
    return [serialize_user(row) for row in rows]


def serialize_user(row) -> dict:
    if not row:
        return {}
    d = dict(row)
    return {
        "id": d.get("id"),
        "username": d.get("username"),
        "email": d.get("email"),
        "name": d.get("name"),
        "profilePicture": d.get("profile_picture"),
        "googleId": d.get("google_id"),
        "createdAt": d.get("created_at"),
        "updatedAt": d.get("updated_at"),
        "lastLogin": d.get("last_login"),
    }
