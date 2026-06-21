from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from backend.db.models import get_connection


@dataclass
class CategoryBudget:
    category_id: int
    category_name: str
    sort_order: int
    budget_cents: int
    spent_cents: int

    @property
    def remaining_cents(self) -> int:
        return self.budget_cents - self.spent_cents

    @property
    def usage_percent(self) -> float | None:
        if self.budget_cents <= 0:
            return None
        return round(self.spent_cents / self.budget_cents * 100, 1)


class Repository:
    def __init__(self, db_path):
        self.db_path = db_path

    def upsert_category(self, conn, name: str, sort_order: int) -> int:
        conn.execute(
            """
            INSERT INTO categories (name, sort_order, is_active)
            VALUES (?, ?, 1)
            ON CONFLICT(name) DO UPDATE SET sort_order = excluded.sort_order
            """,
            (name, sort_order),
        )
        row = conn.execute("SELECT id FROM categories WHERE name = ?", (name,)).fetchone()
        return int(row["id"])

    def upsert_monthly_budget(
        self,
        conn,
        year_month: str,
        category_id: int,
        budget_cents: int,
        spent_cents: int,
    ) -> None:
        conn.execute(
            """
            INSERT INTO monthly_budgets (year_month, category_id, budget_cents, spent_cents)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(year_month, category_id) DO UPDATE SET
                budget_cents = excluded.budget_cents,
                spent_cents = excluded.spent_cents
            """,
            (year_month, category_id, budget_cents, spent_cents),
        )

    def list_months(self) -> list[str]:
        with get_connection(self.db_path) as conn:
            rows = conn.execute(
                "SELECT DISTINCT year_month FROM monthly_budgets ORDER BY year_month DESC"
            ).fetchall()
            return [row["year_month"] for row in rows]

    def get_overview(self, year_month: str) -> list[CategoryBudget]:
        with get_connection(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT c.id AS category_id, c.name AS category_name, c.sort_order,
                       mb.budget_cents, mb.spent_cents
                FROM monthly_budgets mb
                JOIN categories c ON c.id = mb.category_id
                WHERE mb.year_month = ?
                ORDER BY c.sort_order, c.name
                """,
                (year_month,),
            ).fetchall()
            return [
                CategoryBudget(
                    category_id=row["category_id"],
                    category_name=row["category_name"],
                    sort_order=row["sort_order"],
                    budget_cents=row["budget_cents"],
                    spent_cents=row["spent_cents"],
                )
                for row in rows
            ]

    def start_sync_run(self) -> int:
        now = datetime.now(timezone.utc).isoformat()
        with get_connection(self.db_path) as conn:
            cur = conn.execute(
                "INSERT INTO sync_runs (started_at, status) VALUES (?, 'running')",
                (now,),
            )
            return int(cur.lastrowid)

    def finish_sync_run(
        self,
        run_id: int,
        status: str,
        rows_processed: int = 0,
        error_message: str | None = None,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with get_connection(self.db_path) as conn:
            conn.execute(
                """
                UPDATE sync_runs
                SET finished_at = ?, status = ?, rows_processed = ?, error_message = ?
                WHERE id = ?
                """,
                (now, status, rows_processed, error_message, run_id),
            )

    def get_latest_sync_status(self) -> dict | None:
        with get_connection(self.db_path) as conn:
            row = conn.execute(
                """
                SELECT id, started_at, finished_at, status, rows_processed, error_message
                FROM sync_runs
                ORDER BY id DESC
                LIMIT 1
                """
            ).fetchone()
            if not row:
                return None
            return dict(row)
