from fastapi import FastAPI
from sqlalchemy import text

from app.db import engine

app = FastAPI(title="ExamsPrep API", version="0.1.0")


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/health/db")
def health_db() -> dict[str, bool]:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"ok": True, "database": True}
