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
            months = [row["year_month"] for row in rows]

        result: list[str] = []
        years_added: set[str] = set()
        for entry in months:
            result.append(entry)
            if entry.endswith("-01"):
                year = entry[:4]
                result.append(year)
                years_added.add(year)

        for year in sorted({m[:4] for m in months}, reverse=True):
            if year not in years_added:
                result.append(year)

        return result

    def get_overview(self, period: str) -> list[CategoryBudget]:
        if len(period) == 4 and period.isdigit():
            return self.get_yearly_overview(period)
        return self._get_monthly_overview(period)

    def get_month_spent(self, year_month: str) -> dict[int, int]:
        """Ausgaben (cents) je Kategorie für einen einzelnen Monat."""
        with get_connection(self.db_path) as conn:
            rows = conn.execute(
                "SELECT category_id, spent_cents FROM monthly_budgets WHERE year_month = ?",
                (year_month,),
            ).fetchall()
            return {int(r["category_id"]): int(r["spent_cents"]) for r in rows}

    def _get_monthly_overview(self, year_month: str) -> list[CategoryBudget]:
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
            return self._rows_to_budgets(rows)

    def get_yearly_overview(self, year: str) -> list[CategoryBudget]:
        with get_connection(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT c.id AS category_id, c.name AS category_name,
                       MIN(c.sort_order) AS sort_order,
                       SUM(mb.budget_cents) AS budget_cents,
                       SUM(mb.spent_cents) AS spent_cents
                FROM monthly_budgets mb
                JOIN categories c ON c.id = mb.category_id
                WHERE mb.year_month LIKE ?
                GROUP BY c.id, c.name
                HAVING SUM(mb.budget_cents) > 0 OR SUM(mb.spent_cents) > 0
                ORDER BY sort_order, c.name
                """,
                (f"{year}-%",),
            ).fetchall()
            return self._rows_to_budgets(rows)

    @staticmethod
    def _rows_to_budgets(rows) -> list[CategoryBudget]:
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
