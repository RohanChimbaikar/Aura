from pathlib import Path

from flask import Flask
from flask_cors import CORS

from routes.auth_routes import auth_bp
from routes.chat_routes import chat_bp
from routes.file_routes import file_bp
from services.db import init_app as init_db_app, init_db
from sockets.socket_handlers import init_socketio, socketio
from routes.aura_routes import aura_bp


BASE_DIR = Path(__file__).resolve().parent


def create_app() -> Flask:
    app = Flask(__name__, instance_relative_config=True)
    app.config.update(
        SECRET_KEY="aura-demo-session-secret",
        DATABASE=str(BASE_DIR / "instance" / "aura.db"),
        UPLOAD_FOLDER=str(BASE_DIR / "uploads"),
        MAX_CONTENT_LENGTH=64 * 1024 * 1024,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
    )

    Path(app.config["UPLOAD_FOLDER"]).mkdir(parents=True, exist_ok=True)
    Path(app.instance_path).mkdir(parents=True, exist_ok=True)

    CORS(
        app,
        supports_credentials=True,
        resources={r"/api/*": {"origins": ["http://localhost:5173"]}},
    )

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

    return app


app = create_app()


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
