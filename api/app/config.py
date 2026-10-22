from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5433/examsprep"
    secret_key: str = "dev-only-change-me-please-use-a-long-local-secret"
    access_token_minutes: int = 60 * 24 * 7
    cors_origins: str = "http://localhost:3000"
    seed_demo_users: bool = True
    media_root: str = "var/media"
    super_admin_name: str = ""
    super_admin_email: str = ""
    super_admin_password: str = ""
    frontend_url: str = ""
    app_url: str = "http://localhost:3000"
    resend_api_key: str = ""
    email_from: str = ""


settings = Settings()


def public_origin() -> str:
    """Site origin used in emailed links. FRONTEND_URL wins; APP_URL remains for older local config."""
    configured = (settings.frontend_url or settings.app_url).strip().rstrip("/")
    return configured or "http://localhost:3000"
