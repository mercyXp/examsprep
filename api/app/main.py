from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.create_super_admin import apply_environment_bootstrap
from app.db import SessionLocal, engine
from app.routers.admin import router as admin_router
from app.routers.auth import router as auth_router
from app.routers.learn import router as learn_router
from app.routers.mail import router as mail_router
from app.routers.staff import router as staff_router
from app.routers.media import router as media_router
from app.routers.onboarding import router as onboarding_router


def _bootstrap_super_admin() -> None:
    session = SessionLocal()
    try:
        message = apply_environment_bootstrap(session)
    finally:
        session.close()
    if message:
        print(message, flush=True)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _bootstrap_super_admin()
    yield


app = FastAPI(title="ExamsPrep API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(onboarding_router)
app.include_router(admin_router)
app.include_router(staff_router)
app.include_router(mail_router)
app.include_router(learn_router)
app.include_router(media_router)


@app.exception_handler(StarletteHTTPException)
async def http_error(_request: Request, error: StarletteHTTPException) -> JSONResponse:
    message = error.detail if isinstance(error.detail, str) else "Something went wrong. Please try again."
    return JSONResponse({"ok": False, "message": message}, status_code=error.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, _error: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        {"ok": False, "message": "Check the details you entered and try again."},
        status_code=422,
    )


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/health/db")
def health_db() -> dict[str, bool]:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"ok": True, "database": True}
