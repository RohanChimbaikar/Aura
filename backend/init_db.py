from app import create_app
from services.db import init_db


if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        init_db(seed_demo_users=True)
    print("Database initialized and demo users ensured.")
