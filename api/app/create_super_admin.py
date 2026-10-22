"""Create one production super administrator.

On a host with a shell:

    python -m app.create_super_admin

On Render free, which has no shell, set SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, and
SUPER_ADMIN_PASSWORD on the API service and redeploy. Startup creates the account
once, then those three variables should be deleted.

Neither path is exposed as an API.
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
from app.security import hash_password, verify_password

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


def create_super_admin(session: Session, *, name: str, email: str, password: str, ensure_role: bool = False) -> User:
    """Insert one super administrator. Does not commit. Raises BootstrapError without changing existing accounts."""
    name = name.strip()
    email = email.strip().lower()
    validate_credentials(name, email, password)
    _require_tables(session)
    if ensure_role:
        _ensure_super_role(session)

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


def run_bootstrap(session: Session, *, name: str, email: str, password: str, ensure_role: bool = False) -> User:
    try:
        user = create_super_admin(session, name=name, email=email, password=password, ensure_role=ensure_role)
        session.commit()
        return user
    except Exception:
        session.rollback()
        raise


def _environment_credentials() -> tuple[str, str, str] | None:
    name = settings.super_admin_name.strip()
    email = settings.super_admin_email.strip()
    password = settings.super_admin_password
    if not name and not email and not password:
        return None
    if not name or not email or not password:
        raise BootstrapError(
            "Set SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, and SUPER_ADMIN_PASSWORD together, or leave all three empty."
        )
    return name, email, password


def _ensure_super_role(session: Session) -> None:
    role = session.scalar(select(Role).where(Role.slug == SUPER_ROLE))
    if role is not None:
        return
    session.add(
        Role(
            slug=SUPER_ROLE,
            name="Super administrator",
            description="Assigns roles, owns platform configuration, and inspects audit logs.",
        )
    )
    session.flush()


def _super_administrators(session: Session) -> list[User]:
    return list(
        session.scalars(
            select(User)
            .join(UserRole, UserRole.user_id == User.id)
            .join(Role, Role.id == UserRole.role_id)
            .where(Role.slug == SUPER_ROLE)
        ).unique()
    )


def _retire_demo_super_role(session: Session, role: Role) -> bool:
    """Drop the super-administrator role from the demo account. The user row stays."""
    demo = session.scalar(select(User).where(User.email == DEMO_EMAIL))
    if demo is None:
        return False
    link = session.scalar(select(UserRole).where(UserRole.user_id == demo.id, UserRole.role_id == role.id))
    if link is None:
        return False
    session.delete(link)
    return True


def bootstrap_from_environment(session: Session) -> str | None:
    """Install the configured super administrator. None means the variables are unset.

    Login never reads these variables. It checks the password stored on the user row.
    The demo super administrator does not block this. That account is kept, and the
    role moves to the configured email. A different real super administrator still blocks it.
    """
    credentials = _environment_credentials()
    if credentials is None:
        return None
    name, email, password = credentials
    name = name.strip()
    email = email.strip().lower()
    validate_credentials(name, email, password)
    _require_tables(session)
    _ensure_super_role(session)
    role = session.scalar(select(Role).where(Role.slug == SUPER_ROLE))
    if role is None:
        raise BootstrapError("The super_administrator role is missing. No account was created.")

    holders = _super_administrators(session)
    if any(user.email not in {DEMO_EMAIL, email} for user in holders):
        raise BootstrapError("A super administrator already exists. This command does not create another one.")

    existing = session.scalar(select(User).where(User.email == email))
    created = existing is None
    if existing is None:
        existing = User(name=name, email=email, password_hash=hash_password(password), status=UserStatus.ACTIVE)
        session.add(existing)
        session.flush()
    else:
        already_super = any(user.id == existing.id for user in holders)
        if not already_super:
            raise BootstrapError("An account with that email already exists. This command does not change existing accounts.")
        if not verify_password(password, existing.password_hash or ""):
            existing.password_hash = hash_password(password)
        existing.name = name
        existing.status = UserStatus.ACTIVE

    link = session.scalar(select(UserRole).where(UserRole.user_id == existing.id, UserRole.role_id == role.id))
    if link is None:
        session.add(UserRole(user=existing, role=role))
    retired = _retire_demo_super_role(session, role)
    session.commit()

    if created and retired:
        return (
            f"Super administrator created for {email}. "
            "The demo account was kept and no longer has the super administrator role."
        )
    if created:
        return f"Super administrator created for {email}."
    if retired:
        return (
            f"Super administrator ready for {email}. "
            "The demo account was kept and no longer has the super administrator role."
        )
    return f"Super administrator ready for {email}."


def apply_environment_bootstrap(session: Session) -> str | None:
    """Startup wrapper. Returns a log line, or None when no bootstrap was requested."""
    try:
        return bootstrap_from_environment(session)
    except BootstrapError as error:
        session.rollback()
        return f"Super administrator was not created: {error}"
    except Exception:
        session.rollback()
        return "Super administrator was not created. Check DATABASE_URL and run alembic upgrade head."


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
