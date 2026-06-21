from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    spreadsheet_id: str = "1o3NK9Bypgr2NtbwgwMy9kgUpZ9V_tsRX"
    google_application_credentials: str = "./secrets/google-service-account.json"
    database_path: str = "./data/kontomanager.db"
    parser_config_path: str = "./backend/sync/parser_config.yaml"
    sync_interval_minutes: int = 30
    sync_on_startup: bool = True
    host: str = "0.0.0.0"
    port: int = 8080
    static_dir: str = "./static"
    use_sample_data: bool = False

    @property
    def credentials_path(self) -> Path:
        return Path(self.google_application_credentials)

    @property
    def db_path(self) -> Path:
        return Path(self.database_path)


@lru_cache
def get_settings() -> Settings:
    return Settings()
