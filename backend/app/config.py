from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve `.env` to this package's parent (`backend/`) so settings load even when
# uvicorn is started from the repo root or another cwd.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_DIR / ".env"


class Settings(BaseSettings):
    """Application settings."""

    model_config = SettingsConfigDict(env_file=_ENV_FILE, env_file_encoding="utf-8")

    # If set, only this Overpass instance is used. Otherwise OVERPASS_API_URLS is tried in order.
    OVERPASS_API_URL: str = ""
    OVERPASS_API_URLS: str = (
        "https://overpass-api.de/api/interpreter,"
        "https://overpass.kumi.systems/api/interpreter,"
        "https://overpass.openstreetmap.fr/api/interpreter"
    )
    STRAVA_API_URL: str = "https://www.strava.com/api/v3"
    FRONTEND_URL: str = "http://localhost:3000"
    # Comma-separated extra allowed browser origins for CORS (e.g. http://127.0.0.1:5173).
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"
    STRAVA_CLIENT_ID: str = ""
    STRAVA_CLIENT_SECRET: str = ""
    STRAVA_REDIRECT_URI: str = "http://localhost:3000/auth/callback"


settings = Settings()


def overpass_endpoints() -> List[str]:
    """Overpass `/api/interpreter` URLs to try (failover on timeouts / overload)."""
    single = settings.OVERPASS_API_URL.strip()
    if single:
        return [single.rstrip("/")]
    urls = [u.strip().rstrip("/") for u in settings.OVERPASS_API_URLS.split(",") if u.strip()]
    return urls or ["https://overpass-api.de/api/interpreter"]
