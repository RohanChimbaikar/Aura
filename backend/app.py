import os
import datetime
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from workspace root
load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))

from flask import Flask, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager

from routes.auth_routes import auth_bp
from routes.chat_routes import chat_bp
from routes.file_routes import file_bp
from services.db import init_app as init_db_app, init_db
from sockets.socket_handlers import init_socketio, socketio
from routes.aura_routes import aura_bp
from services.aura_service import OUTPUT_DIR
from utils.limiter import limiter

BASE_DIR = Path(__file__).resolve().parent


def create_app() -> Flask:
    app = Flask(__name__, instance_relative_config=True)
    
    # Load configuration from environment
    jwt_secret = os.environ.get("JWT_SECRET_KEY", "aura-jwt-fallback-secret-key-1337")
    google_client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    smtp_host = os.environ.get("SMTP_HOST", "")
    smtp_port = os.environ.get("SMTP_PORT", "")
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_password = os.environ.get("SMTP_PASSWORD", "")
    smtp_sender = os.environ.get("SMTP_SENDER", "")

    app.config.update(
        SECRET_KEY=os.environ.get("SECRET_KEY", "aura-demo-session-secret"),
        DATABASE=str(BASE_DIR / "instance" / "aura.db"),
        UPLOAD_FOLDER=str(BASE_DIR / "uploads"),
        MAX_CONTENT_LENGTH=64 * 1024 * 1024,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        
        # JWT-Extended Settings
        JWT_SECRET_KEY=jwt_secret,
        JWT_TOKEN_LOCATION=["cookies"],
        JWT_ACCESS_COOKIE_PATH="/",
        JWT_REFRESH_COOKIE_PATH="/",
        JWT_COOKIE_CSRF_PROTECT=False,  # Set to False to prevent CSRF complexity in React SPA
        JWT_COOKIE_SECURE=False,       # Set to True in production when running on HTTPS
        JWT_ACCESS_TOKEN_EXPIRES=datetime.timedelta(minutes=int(os.environ.get("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", 15))),
        JWT_REFRESH_TOKEN_EXPIRES=datetime.timedelta(days=int(os.environ.get("JWT_REFRESH_TOKEN_EXPIRES_DAYS", 7))),
        
        # Google OAuth
        GOOGLE_CLIENT_ID=google_client_id,
        
        # SMTP Server
        SMTP_HOST=smtp_host,
        SMTP_PORT=smtp_port,
        SMTP_USER=smtp_user,
        SMTP_PASSWORD=smtp_password,
        SMTP_SENDER=smtp_sender,
    )

    Path(app.config["UPLOAD_FOLDER"]).mkdir(parents=True, exist_ok=True)
    Path(app.instance_path).mkdir(parents=True, exist_ok=True)

    dev_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
    CORS(
        app,
        supports_credentials=True,
        resources={
            r"/api/*": {"origins": dev_origins},
            r"/outputs/*": {"origins": dev_origins}
        },
    )

    # Initialize extensions
    JWTManager(app)
    limiter.init_app(app)
    
    init_db_app(app)
    init_socketio(app)

    with app.app_context():
        init_db(seed_demo_users=True)

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(chat_bp, url_prefix="/api/chat")
    app.register_blueprint(file_bp, url_prefix="/api/files")
    app.register_blueprint(aura_bp, url_prefix="/api")

    @app.get("/api/health")
    def healthcheck():
        return {"status": "ok"}

    @app.get("/outputs/<path:filename>")
    def outputs_file(filename: str):
        return send_from_directory(OUTPUT_DIR, filename)

    return app


app = create_app()


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
