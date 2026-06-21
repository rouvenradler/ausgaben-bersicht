from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler

from backend.config import Settings
from backend.sync.worker import SyncWorker

logger = logging.getLogger(__name__)


class SyncScheduler:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.scheduler = BackgroundScheduler()
        self._worker = SyncWorker(settings)

    def _job(self) -> None:
        try:
            result = self._worker.run()
            logger.info("Sync completed: %s", result)
        except Exception:
            logger.exception("Sync failed")

    def start(self) -> None:
        interval = self.settings.sync_interval_minutes
        self.scheduler.add_job(self._job, "interval", minutes=interval, id="sheet_sync")
        self.scheduler.start()
        logger.info("Scheduler started (every %s minutes)", interval)

        if self.settings.sync_on_startup:
            try:
                self._job()
            except Exception:
                logger.exception("Initial sync on startup failed")

    def shutdown(self) -> None:
        self.scheduler.shutdown(wait=False)

    def trigger_now(self) -> dict:
        return self._worker.run()
