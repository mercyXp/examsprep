"""Create one production super administrator.

Run once against the target database:

    python -m app.create_super_admin

This module is not imported at application startup and is not exposed as an API.
"""

from __future__ import annotations

import getpass
from collections.abc import Callable

from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models import Role, User, UserRole
from app.models.enums import UserStatus
from app.security import hash_password

SUPER_ROLE = "super_administrator"
DEMO_EMAIL = "super@examsprep.local"
DEMO_PASSWORD = "examsready"
REQUIRED_TABLES = ("users", "roles", "user_roles")


class BootstrapError(Exception):
    """The account was not created. The message is safe to show to the operator."""


def database_configuration_error() -> str | None:
    url = settings.database_url.strip()
    if not url.startswith("postgresql"):
        return "Database configuration is invalid. Set DATABASE_URL to a PostgreSQL URL."
    if "YOUR_PASSWORD" in url:
        return "Database configuration is invalid. DATABASE_URL still contains the placeholder password."
    return None


def validate_credentials(name: str, email: str, password: str) -> None:
    if not name or len(name) > 120:
        raise BootstrapError("Enter a name up to 120 characters.")
    if "@" not in email or email.startswith("@") or email.endswith("@") or not 3 <= len(email) <= 255:
        raise BootstrapError("Enter a valid email address.")
    if email == DEMO_EMAIL:
        raise BootstrapError("That email is reserved for the demo seed. Use the real administrator's email.")
    if not 8 <= len(password) <= 128:
        raise BootstrapError("Use a password between 8 and 128 characters.")
    if password == DEMO_PASSWORD:
        raise BootstrapError("That password is reserved for the demo seed. Choose a different password.")


def prompt_super_admin(
    input_func: Callable[[str], str] = input,
    password_func: Callable[[str], str] = getpass.getpass,
) -> tuple[str, str, str]:
    name = input_func("Full name: ").strip()
    email = input_func("Email: ").strip().lower()
    password = password_func("Password: ")
    confirmed = password_func("Confirm password: ")
    if password != confirmed:
        raise BootstrapError("Passwords do not match. No account was created.")
    validate_credentials(name, email, password)
    typed = input_func("Type CREATE to create this super administrator: ").strip()
    if typed != "CREATE":
        raise BootstrapError("Cancelled. No account was created.")
    return name, email, password


def _require_tables(session: Session) -> None:
    try:
        names = set(inspect(session.get_bind()).get_table_names())
    except Exception as error:
        raise BootstrapError("Could not read the database. Check DATABASE_URL and run alembic upgrade head.") from error
    missing = [name for name in REQUIRED_TABLES if name not in names]
    if missing:
        raise BootstrapError("Required tables are missing. Run alembic upgrade head before creating a super administrator.")


def create_super_admin(session: Session, *, name: str, email: str, password: str) -> User:
    """Insert one super administrator. Does not commit. Raises BootstrapError without changing existing accounts."""
    name = name.strip()
    email = email.strip().lower()
    validate_credentials(name, email, password)
    _require_tables(session)

    role = session.scalar(select(Role).where(Role.slug == SUPER_ROLE))
    if role is None:
        raise BootstrapError("The super_administrator role is missing. No account was created.")

    existing = session.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise BootstrapError("An account with that email already exists. This command does not change existing accounts.")

    already = session.scalar(
        select(User.id)
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .where(Role.slug == SUPER_ROLE)
    )
    if already is not None:
        raise BootstrapError("A super administrator already exists. This command does not create another one.")

    user = User(name=name, email=email, password_hash=hash_password(password), status=UserStatus.ACTIVE)
    session.add(user)
    session.flush()
    session.add(UserRole(user=user, role=role))
    session.flush()
    return user


def run_bootstrap(session: Session, *, name: str, email: str, password: str) -> User:
    try:
        user = create_super_admin(session, name=name, email=email, password=password)
        session.commit()
        return user
    except Exception:
        session.rollback()
        raise


def main() -> int:
    problem = database_configuration_error()
    if problem:
        print(problem)
        return 1

    session = SessionLocal()
    try:
        session.execute(text("SELECT 1"))
        name, email, password = prompt_super_admin()
        run_bootstrap(session, name=name, email=email, password=password)
    except BootstrapError as error:
        print(error)
        return 1
    except (EOFError, KeyboardInterrupt):
        print("Cancelled. No account was created.")
        return 1
    except Exception:
        print("Could not create the super administrator. Check DATABASE_URL and run alembic upgrade head.")
        return 1
    else:
        print(f"Super administrator created for {email}.")
        return 0
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
