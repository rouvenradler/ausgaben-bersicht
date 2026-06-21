from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.api.routes import router
from backend.config import get_settings
from backend.db.models import init_db
from backend.db.repository import Repository
from backend.sync.scheduler import SyncScheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    init_db(settings.db_path)
    app.state.settings = settings
    app.state.repo = Repository(settings.db_path)
    scheduler = SyncScheduler(settings)
    app.state.scheduler = scheduler
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(title="Kontomanager", lifespan=lifespan)
app.include_router(router)

settings = get_settings()
static_dir = Path(settings.static_dir)

if static_dir.exists() and (static_dir / "index.html").exists():
    assets_dir = static_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/")
    async def serve_index():
        return FileResponse(static_dir / "index.html")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api") or full_path in ("docs", "openapi.json", "redoc"):
            raise HTTPException(status_code=404)
        candidate = static_dir / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(static_dir / "index.html")
else:

    @app.get("/")
    async def root():
        return {
            "message": "Kontomanager API running. Build frontend into ./static or use Docker.",
            "docs": "/docs",
        }
