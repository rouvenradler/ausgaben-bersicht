from __future__ import annotations

import re
import sqlite3
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS monthly_budgets (
    year_month TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    budget_cents INTEGER NOT NULL DEFAULT 0,
    spent_cents INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (year_month, category_id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    rows_processed INTEGER NOT NULL DEFAULT 0,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    value_cents INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS asset_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_name TEXT NOT NULL,
    name TEXT NOT NULL,
    iban TEXT NOT NULL DEFAULT '',
    value_cents INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    institute TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    owner TEXT NOT NULL DEFAULT '',
    as_of TEXT NOT NULL DEFAULT '',
    rate_kind TEXT NOT NULL DEFAULT '',
    rate_value REAL NOT NULL DEFAULT 0
);
"""


def init_db(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.executescript(SCHEMA)
        existing = {row[1] for row in conn.execute("PRAGMA table_info(asset_accounts)")}
        extra_columns = {
            "institute": "TEXT NOT NULL DEFAULT ''",
            "category": "TEXT NOT NULL DEFAULT ''",
            "owner": "TEXT NOT NULL DEFAULT ''",
            "as_of": "TEXT NOT NULL DEFAULT ''",
            "rate_kind": "TEXT NOT NULL DEFAULT ''",
            "rate_value": "REAL NOT NULL DEFAULT 0",
        }
        for name, ddl in extra_columns.items():
            if name not in existing:
                conn.execute(f"ALTER TABLE asset_accounts ADD COLUMN {name} {ddl}")


@contextmanager
def get_connection(db_path: Path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def parse_year_month(tab_name: str, pattern: str) -> str | None:
    if re.match(r"^\d{4}-\d{2}$", tab_name):
        return tab_name
    match = re.match(r"^(\d{2})/(\d{4})$", tab_name)
    if match:
        return f"{match.group(2)}-{match.group(1)}"
    if re.match(pattern, tab_name):
        return tab_name
    return None
