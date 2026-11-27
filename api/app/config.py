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
    google_client_id: str = ""
    # Solana hackathon phase 1. Leave the keypairs empty until you deploy.
    # See docs/architecture/solana.md. Secrets stay on the API, never on Vercel.
    solana_rpc_url: str = "https://api.devnet.solana.com"
    solana_program_id: str = "Ebo9c8SiwLx37wXejAwQmx1vLv1YtR8kYVb2Lb6V8FVH"
    solana_authority_keypair: str = ""
    solana_sponsor_keypair: str = ""
    solana_usdc_mint: str = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
    # "live" talks to SOLANA_RPC_URL. "record" stores the calls and does not
    # send them (local demos and tests). "off" refuses chain actions.
    solana_chain_mode: str = ""


settings = Settings()


def public_origin() -> str:
    """Site origin used in emailed links. FRONTEND_URL wins; APP_URL remains for older local config."""
    configured = (settings.frontend_url or settings.app_url).strip().rstrip("/")
    return configured or "http://localhost:3000"
