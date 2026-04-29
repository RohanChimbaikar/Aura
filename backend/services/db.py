import sqlite3
from pathlib import Path

from flask import current_app, g


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT NOT NULL,
    receiver TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender) REFERENCES users (username),
    FOREIGN KEY (receiver) REFERENCES users (username)
);

CREATE TABLE IF NOT EXISTS audio_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT NOT NULL,
    receiver TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    stored_filename TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender) REFERENCES users (username),
    FOREIGN KEY (receiver) REFERENCES users (username)
);

CREATE TABLE IF NOT EXISTS audio_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    file_hash TEXT,
    sample_rate INTEGER,
    duration_seconds REAL,
    num_samples INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transmissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transmission_id TEXT NOT NULL UNIQUE,
    chat_id TEXT,
    total_parts INTEGER NOT NULL,
    status TEXT NOT NULL,
    payload_preview TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS stego_generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    generation_id TEXT NOT NULL UNIQUE,
    cover_asset_id TEXT NOT NULL,
    stego_asset_id TEXT NOT NULL,
    transmission_id TEXT,
    part_number INTEGER,
    total_parts INTEGER,
    encoder_model_name TEXT,
    encoder_version TEXT,
    payload_type TEXT,
    payload_bits INTEGER,
    payload_chars INTEGER,
    sample_rate INTEGER,
    duration_seconds REAL,
    cover_duration_seconds REAL,
    stego_duration_seconds REAL,
    cover_num_samples INTEGER,
    stego_num_samples INTEGER,
    chunk_count INTEGER,
    carrier_chunk_duration_seconds REAL,
    is_grouped INTEGER NOT NULL DEFAULT 0,
    group_role TEXT,
    parent_message_id TEXT,
    source_chat_message_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cover_asset_id) REFERENCES audio_assets (asset_id),
    FOREIGN KEY (stego_asset_id) REFERENCES audio_assets (asset_id)
);

CREATE TABLE IF NOT EXISTS transmission_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transmission_id TEXT NOT NULL,
    part_number INTEGER NOT NULL,
    total_parts INTEGER NOT NULL,
    cover_asset_id TEXT,
    stego_asset_id TEXT,
    file_path TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transmission_id) REFERENCES transmissions (transmission_id),
    FOREIGN KEY (cover_asset_id) REFERENCES audio_assets (asset_id),
    FOREIGN KEY (stego_asset_id) REFERENCES audio_assets (asset_id)
);

CREATE TABLE IF NOT EXISTS analysis_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    analysis_id TEXT NOT NULL UNIQUE,
    source_type TEXT NOT NULL,
    source_ref_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS analysis_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    analysis_id TEXT NOT NULL,
    recovery_confidence REAL,
    integrity_score REAL,
    header_valid INTEGER,
    sequence_valid INTEGER,
    files_processed INTEGER,
    files_total INTEGER,
    payload_chunks INTEGER,
    ignored_tail INTEGER,
    corrections_applied INTEGER,
    corrections_count INTEGER,
    missing_parts_count INTEGER,
    duplicate_parts_count INTEGER,
    snr_db_overall REAL,
    mse_overall REAL,
    stft_delta_score REAL,
    recovered_text TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (analysis_id) REFERENCES analysis_runs (analysis_id)
);

CREATE TABLE IF NOT EXISTS chunk_analysis_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    analysis_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    part_number INTEGER,
    status TEXT,
    confidence REAL,
    snr_db REAL,
    mse REAL,
    stft_delta_score REAL,
    bit_agreement REAL,
    correction_applied INTEGER,
    correction_count INTEGER,
    is_missing INTEGER,
    is_duplicate INTEGER,
    sequence_valid INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (analysis_id) REFERENCES analysis_runs (analysis_id)
);
"""


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        db_path = Path(current_app.config["DATABASE"])
        db_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(db_path)
        connection.row_factory = sqlite3.Row
        g.db = connection
    return g.db


def close_db(_error=None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def init_db(seed_demo_users: bool = False) -> None:
    db = get_db()
    db.executescript(SCHEMA)
    db.commit()

    if seed_demo_users:
        from services.auth_service import ensure_demo_users

        ensure_demo_users()


def init_app(app) -> None:
    app.teardown_appcontext(close_db)
