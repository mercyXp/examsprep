import unittest
from unittest.mock import patch

from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.create_super_admin import (
    BootstrapError,
    apply_environment_bootstrap,
    create_super_admin,
    database_configuration_error,
    prompt_super_admin,
    run_bootstrap,
)
from app.models.enums import UserStatus
from app.models.identity import Role, User, UserRole
from app.security import verify_password


def answers(*values: str):
    remaining = list(values)

    def _input(_prompt: str) -> str:
        if not remaining:
            raise AssertionError("unexpected prompt")
        return remaining.pop(0)

    return _input


class SuperAdminBootstrapTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://")
        User.__table__.create(self.engine)
        Role.__table__.create(self.engine)
        UserRole.__table__.create(self.engine)
        self.session: Session = sessionmaker(bind=self.engine)()
        self.role = Role(slug="super_administrator", name="Super administrator", description="")
        self.session.add(self.role)
        self.session.commit()

    def tearDown(self) -> None:
        self.session.close()
        self.engine.dispose()

    def test_creates_hashed_super_administrator(self) -> None:
        user = run_bootstrap(
            self.session,
            name="Mercy Phiri",
            email="Mercy@Example.com",
            password="a-real-secret",
        )
        self.assertEqual(user.email, "mercy@example.com")
        self.assertEqual(user.status, UserStatus.ACTIVE)
        self.assertNotEqual(user.password_hash, "a-real-secret")
        self.assertTrue(user.password_hash)
        self.assertTrue(verify_password("a-real-secret", user.password_hash or ""))
        slugs = [item.role.slug for item in user.roles if item.role is not None]
        self.assertEqual(slugs, ["super_administrator"])
        stored = self.session.scalar(select(User).where(User.email == "mercy@example.com"))
        self.assertIsNotNone(stored)

    def test_does_not_promote_an_existing_account(self) -> None:
        student = User(name="Ada", email="ada@example.com", password_hash="already-set", status=UserStatus.ACTIVE)
        self.session.add(student)
        self.session.commit()
        with self.assertRaises(BootstrapError) as caught:
            create_super_admin(self.session, name="Ada", email="ada@example.com", password="another-secret")
        self.assertIn("does not change", str(caught.exception))
        self.session.rollback()
        kept = self.session.scalar(select(User).where(User.email == "ada@example.com"))
        self.assertIsNotNone(kept)
        self.assertEqual(kept.password_hash, "already-set")
        self.assertEqual(kept.roles, [])

    def test_refuses_a_second_super_administrator(self) -> None:
        run_bootstrap(self.session, name="First", email="first@example.com", password="first-secret")
        with self.assertRaises(BootstrapError) as caught:
            create_super_admin(self.session, name="Second", email="second@example.com", password="second-secret")
        self.assertIn("already exists", str(caught.exception))
        emails = set(self.session.scalars(select(User.email)))
        self.assertEqual(emails, {"first@example.com"})

    def test_missing_role(self) -> None:
        self.session.execute(delete(Role))
        self.session.commit()
        with self.assertRaises(BootstrapError) as caught:
            create_super_admin(self.session, name="Mercy", email="mercy@example.com", password="a-real-secret")
        self.assertIn("role is missing", str(caught.exception))
        self.assertIsNone(self.session.scalar(select(User).where(User.email == "mercy@example.com")))

    def test_missing_tables(self) -> None:
        engine = create_engine("sqlite://")
        session = sessionmaker(bind=engine)()
        try:
            with self.assertRaises(BootstrapError) as caught:
                create_super_admin(session, name="Mercy", email="mercy@example.com", password="a-real-secret")
            self.assertIn("tables are missing", str(caught.exception))
        finally:
            session.close()
            engine.dispose()

    def test_password_mismatch_and_cancelled_confirmation_do_not_return_credentials(self) -> None:
        with self.assertRaises(BootstrapError) as mismatch:
            prompt_super_admin(
                input_func=answers("Mercy", "mercy@example.com"),
                password_func=answers("a-real-secret", "different-secret"),
            )
        self.assertIn("do not match", str(mismatch.exception))
        with self.assertRaises(BootstrapError) as cancelled:
            prompt_super_admin(
                input_func=answers("Mercy", "mercy@example.com", "no"),
                password_func=answers("a-real-secret", "a-real-secret"),
            )
        self.assertIn("Cancelled", str(cancelled.exception))

    def test_rejects_demo_credentials(self) -> None:
        with self.assertRaises(BootstrapError):
            prompt_super_admin(
                input_func=answers("Sam", "super@examsprep.local", "CREATE"),
                password_func=answers("a-real-secret", "a-real-secret"),
            )
        with self.assertRaises(BootstrapError):
            prompt_super_admin(
                input_func=answers("Mercy", "mercy@example.com", "CREATE"),
                password_func=answers("examsready", "examsready"),
            )

    def test_commit_failure_rolls_back(self) -> None:
        real_commit = self.session.commit

        def fail_commit() -> None:
            raise RuntimeError("commit failed")

        self.session.commit = fail_commit  # type: ignore[method-assign]
        with self.assertRaises(RuntimeError):
            run_bootstrap(self.session, name="Mercy", email="mercy@example.com", password="a-real-secret")
        self.session.commit = real_commit  # type: ignore[method-assign]
        self.assertIsNone(self.session.scalar(select(User).where(User.email == "mercy@example.com")))

    def _use_environment(self, name: str, email: str, password: str):
        return patch.multiple(
            "app.create_super_admin.settings",
            super_admin_name=name,
            super_admin_email=email,
            super_admin_password=password,
        )

    def test_environment_bootstrap_creates_role_and_account(self) -> None:
        self.session.execute(delete(Role))
        self.session.commit()
        with self._use_environment("Mercy Phiri", "Mercy@Example.com", "a-real-secret"):
            message = apply_environment_bootstrap(self.session)
        self.assertEqual(message, "Super administrator created for mercy@example.com.")
        self.assertNotIn("a-real-secret", message or "")
        user = self.session.scalar(select(User).where(User.email == "mercy@example.com"))
        self.assertIsNotNone(user)
        self.assertTrue(verify_password("a-real-secret", user.password_hash or ""))
        self.assertEqual([item.role.slug for item in user.roles if item.role is not None], ["super_administrator"])

    def test_environment_bootstrap_skips_when_unset_and_refuses_a_second_account(self) -> None:
        with self._use_environment("", "", ""):
            self.assertIsNone(apply_environment_bootstrap(self.session))
        with self._use_environment("Mercy", "mercy@example.com", "a-real-secret"):
            apply_environment_bootstrap(self.session)
            again = apply_environment_bootstrap(self.session)
        self.assertIn("ready for mercy@example.com", again or "")
        self.assertEqual(set(self.session.scalars(select(User.email))), {"mercy@example.com"})
        kept = self.session.scalar(select(User).where(User.email == "mercy@example.com"))
        self.assertIsNotNone(kept)
        self.assertTrue(verify_password("a-real-secret", kept.password_hash or ""))

    def test_environment_bootstrap_replaces_the_demo_super_role(self) -> None:
        demo = User(name="Sam Super", email="super@examsprep.local", password_hash="demo-hash", status=UserStatus.ACTIVE)
        self.session.add(demo)
        self.session.flush()
        self.session.add(UserRole(user=demo, role=self.role))
        self.session.commit()
        with self._use_environment("Mercy Phiri", "mercy@example.com", "a-real-secret"):
            message = apply_environment_bootstrap(self.session)
        self.assertIn("created for mercy@example.com", message or "")
        self.assertIn("demo account was kept", message or "")
        self.assertNotIn("a-real-secret", message or "")
        demo_row = self.session.scalar(select(User).where(User.email == "super@examsprep.local"))
        real = self.session.scalar(select(User).where(User.email == "mercy@example.com"))
        self.assertIsNotNone(demo_row)
        self.assertIsNotNone(real)
        self.assertEqual(demo_row.password_hash, "demo-hash")
        self.assertEqual(demo_row.roles, [])
        self.assertTrue(verify_password("a-real-secret", real.password_hash or ""))
        self.assertEqual([item.role.slug for item in real.roles if item.role is not None], ["super_administrator"])

    def test_environment_bootstrap_does_not_replace_a_real_super_administrator(self) -> None:
        run_bootstrap(self.session, name="First", email="first@example.com", password="first-secret")
        with self._use_environment("Mercy", "mercy@example.com", "a-real-secret"):
            message = apply_environment_bootstrap(self.session)
        self.assertIn("already exists", message or "")
        self.assertIsNone(self.session.scalar(select(User).where(User.email == "mercy@example.com")))

    def test_environment_bootstrap_requires_all_three_values(self) -> None:
        with self._use_environment("Mercy", "", ""):
            message = apply_environment_bootstrap(self.session)
        self.assertIn("together", message or "")
        self.assertIsNone(self.session.scalar(select(User).where(User.email == "mercy@example.com")))

    def test_invalid_database_configuration(self) -> None:
        with patch.object(settings, "database_url", "sqlite://"):
            self.assertIn("invalid", database_configuration_error() or "")
        with patch.object(settings, "database_url", "postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5433/examsprep"):
            self.assertIn("placeholder", database_configuration_error() or "")


if __name__ == "__main__":
    unittest.main()
