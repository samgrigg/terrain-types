from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""

    model_config = SettingsConfigDict(env_file=".env")

    OVERPASS_API_URL: str = "https://overpass-api.de/api/interpreter"
    STRAVA_API_URL: str = "https://www.strava.com/api/v3"
    FRONTEND_URL: str = "http://localhost:3000"
    STRAVA_CLIENT_ID: str = ""
    STRAVA_CLIENT_SECRET: str = ""
    STRAVA_REDIRECT_URI: str = "http://localhost:3000/auth/callback"


settings = Settings()
