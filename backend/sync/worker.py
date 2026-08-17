from __future__ import annotations

from pathlib import Path

from backend.config import Settings
from backend.db.models import get_connection, init_db
from backend.db.repository import Repository
from backend.sync.parser import parse_asset_accounts, parse_assets, parse_spreadsheet
from backend.sync.sheets_client import create_sheets_client


class SyncWorker:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.repo = Repository(settings.db_path)
        init_db(settings.db_path)

    def run(self) -> dict:
        run_id = self.repo.start_sync_run()
        try:
            client = create_sheets_client(self.settings)
            all_tabs = client.fetch_all_tabs()
            config_path = Path(self.settings.parser_config_path)
            rows = parse_spreadsheet(all_tabs, config_path)
            assets = parse_assets(all_tabs, config_path)
            accounts = parse_asset_accounts(all_tabs, config_path)

            with get_connection(self.settings.db_path) as conn:
                conn.execute("DELETE FROM monthly_budgets")
                for item in rows:
                    category_id = self.repo.upsert_category(conn, item.category, item.sort_order)
                    self.repo.upsert_monthly_budget(
                        conn,
                        item.year_month,
                        category_id,
                        item.budget_cents,
                        item.spent_cents,
                    )
                self.repo.replace_assets(conn, assets)
                self.repo.replace_asset_accounts(conn, accounts)

            self.repo.finish_sync_run(run_id, "success", rows_processed=len(rows))
            return {
                "status": "success",
                "rows_processed": len(rows),
                "assets_processed": len(assets),
                "accounts_processed": len(accounts),
            }
        except Exception as exc:
            self.repo.finish_sync_run(run_id, "error", error_message=str(exc))
            raise
