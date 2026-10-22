import unittest
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.models.enums import UserStatus
from app.models.identity import Role, User, UserRole
from app.models.staff import StaffInvitation
from app.security import verify_password
from app.staff_invites import (
    StaffInviteError,
    accept_invitation,
    change_staff_role,
    create_invitation,
    find_invitation,
    hash_token,
    invitation_state,
    resend_invitation,
    revoke_invitation,
    set_staff_access,
)


class StaffInvitationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://")
        User.__table__.create(self.engine)
        Role.__table__.create(self.engine)
        UserRole.__table__.create(self.engine)
        StaffInvitation.__table__.create(self.engine)
        self.session: Session = sessionmaker(bind=self.engine)()
        self.session.add_all(
            [
                Role(slug="student", name="Student", description=""),
                Role(slug="creator", name="Creator", description=""),
                Role(slug="administrator", name="Administrator", description=""),
                Role(slug="super_administrator", name="Super administrator", description=""),
            ]
        )
        self.session.commit()

    def tearDown(self) -> None:
        self.session.close()
        self.engine.dispose()

    def test_token_is_stored_as_a_hash_and_accepted_once(self) -> None:
        row, raw = create_invitation(
            self.session,
            email="Editor@Example.com",
            role_slug="creator",
            invited_by_id=None,
        )
        self.session.commit()
        self.assertNotEqual(row.token_hash, raw)
        self.assertEqual(row.token_hash, hash_token(raw))
        self.assertEqual(invitation_state(row), "pending")

        user = accept_invitation(self.session, raw, "Ada Editor", "a-real-secret")
        self.session.commit()
        self.assertEqual(user.email, "editor@example.com")
        self.assertEqual(user.status, UserStatus.ACTIVE)
        self.assertTrue(verify_password("a-real-secret", user.password_hash or ""))
        self.assertEqual([item.role.slug for item in user.roles if item.role], ["creator"])

        with self.assertRaises(StaffInviteError) as caught:
            accept_invitation(self.session, raw, "Ada Editor", "another-secret")
        self.assertEqual(caught.exception.status_code, 409)

    def test_does_not_upgrade_an_existing_student(self) -> None:
        student = User(name="Sam", email="sam@example.com", password_hash="student-hash", status=UserStatus.ACTIVE)
        self.session.add(student)
        self.session.commit()
        with self.assertRaises(StaffInviteError) as caught:
            create_invitation(self.session, email="sam@example.com", role_slug="administrator", invited_by_id=None)
        self.assertEqual(caught.exception.status_code, 409)
        self.assertIsNone(self.session.scalar(select(StaffInvitation).where(StaffInvitation.email == "sam@example.com")))

    def test_refuses_super_administrator_invitations(self) -> None:
        with self.assertRaises(StaffInviteError) as caught:
            create_invitation(
                self.session,
                email="root@example.com",
                role_slug="super_administrator",
                invited_by_id=None,
            )
        self.assertEqual(caught.exception.status_code, 422)

    def test_expired_and_revoked_links_do_not_activate(self) -> None:
        row, raw = create_invitation(self.session, email="old@example.com", role_slug="creator", invited_by_id=None)
        row.expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
        self.session.commit()
        with self.assertRaises(StaffInviteError) as expired:
            accept_invitation(self.session, raw, "Old", "a-real-secret")
        self.assertEqual(expired.exception.status_code, 410)

        fresh, second = create_invitation(
            self.session, email="fresh@example.com", role_slug="administrator", invited_by_id=None
        )
        revoke_invitation(self.session, fresh.id)
        self.session.commit()
        with self.assertRaises(StaffInviteError) as revoked:
            accept_invitation(self.session, second, "Fresh", "a-real-secret")
        self.assertEqual(revoked.exception.status_code, 410)
        self.assertEqual(invitation_state(fresh), "revoked")

    def test_resend_replaces_the_previous_token(self) -> None:
        row, first = create_invitation(self.session, email="next@example.com", role_slug="creator", invited_by_id=None)
        updated, second = resend_invitation(self.session, row.id)
        self.session.commit()
        self.assertNotEqual(first, second)
        self.assertEqual(updated.token_hash, hash_token(second))
        with self.assertRaises(StaffInviteError):
            find_invitation(self.session, first)
        user = accept_invitation(self.session, second, "Next", "a-real-secret")
        self.assertEqual([item.role.slug for item in user.roles if item.role], ["creator"])

    def test_role_change_and_access_do_not_touch_the_super_administrator(self) -> None:
        row, raw = create_invitation(self.session, email="lead@example.com", role_slug="creator", invited_by_id=None)
        user = accept_invitation(self.session, raw, "Lead", "a-real-secret")
        changed = change_staff_role(self.session, user.id, "administrator")
        self.assertEqual([item.role.slug for item in changed.roles if item.role], ["administrator"])
        suspended = set_staff_access(self.session, user.id, False)
        self.assertEqual(suspended.status, UserStatus.SUSPENDED)
        restored = set_staff_access(self.session, user.id, True)
        self.assertEqual(restored.status, UserStatus.ACTIVE)

        super_role = self.session.scalar(select(Role).where(Role.slug == "super_administrator"))
        assert super_role is not None
        boss = User(name="Boss", email="boss@example.com", password_hash="hash", status=UserStatus.ACTIVE)
        self.session.add(boss)
        self.session.flush()
        self.session.add(UserRole(user_id=boss.id, role_id=super_role.id))
        self.session.commit()
        with self.assertRaises(StaffInviteError) as blocked:
            change_staff_role(self.session, boss.id, "creator")
        self.assertEqual(blocked.exception.status_code, 403)
        self.assertIs(row.accepted_at is not None, True)
