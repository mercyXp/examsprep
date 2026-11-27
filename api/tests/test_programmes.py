"""Programme catalogue changes stay with the super administrator."""

import unittest
import uuid
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from app.access import AccessScope
from app.models.catalogue import AcademicYear, Programme, Semester
from app.models.enums import ProgrammeStatus, UserStatus
from app.models.identity import User
from app.programmes import (
    archive_programme,
    create_programme,
    programmes_for,
    reject_if_archived,
    update_programme,
)


def scope_for(*roles: str, programmes: set[uuid.UUID] | None = None) -> AccessScope:
    super_admin = "super_administrator" in roles
    user = User(
        id=uuid.uuid4(),
        name="Ada Admin",
        email=f"{uuid.uuid4()}@examsprep.local",
        status=UserStatus.ACTIVE,
    )
    return AccessScope(
        user=user,
        roles=list(roles),
        super_admin=super_admin,
        programme_ids=programmes or set(),
        can_manage_catalogue=super_admin or "administrator" in roles,
    )


class ProgrammeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://")
        Programme.__table__.create(self.engine)
        AcademicYear.__table__.create(self.engine)
        Semester.__table__.create(self.engine)
        self.session: Session = sessionmaker(bind=self.engine)()

    def tearDown(self) -> None:
        self.session.close()
        self.engine.dispose()

    def test_super_admin_creates_years_and_a_programme_admin_cannot(self) -> None:
        with patch("app.programmes.write_audit"):
            created = create_programme(
                self.session,
                scope_for("super_administrator"),
                name="Bachelor of Science in Computing",
                slug=None,
                category="Computing",
                status_value="available",
                duration_years=2,
                blurb="Databases through to networks.",
            )
        self.session.commit()
        self.assertEqual(created.slug, "bachelor-of-science-in-computing")
        self.assertEqual(created.status, ProgrammeStatus.AVAILABLE)
        years = self.session.scalar(select(func.count()).select_from(AcademicYear))
        semesters = self.session.scalar(select(func.count()).select_from(Semester))
        self.assertEqual(years, 2)
        self.assertEqual(semesters, 4)

        with self.assertRaises(HTTPException) as caught:
            create_programme(
                self.session,
                scope_for("administrator", programmes={created.id}),
                name="Business",
                slug="business",
                category="Business",
                status_value="available",
                duration_years=1,
                blurb="",
            )
        self.assertEqual(caught.exception.status_code, 403)
        with self.assertRaises(HTTPException) as creator:
            create_programme(
                self.session,
                scope_for("creator"),
                name="Business",
                slug="business",
                category="Business",
                status_value="available",
                duration_years=1,
                blurb="",
            )
        self.assertEqual(creator.exception.status_code, 403)

    def test_archive_hides_a_program_from_new_modules_and_lists_are_scoped(self) -> None:
        with patch("app.programmes.write_audit"):
            computing = create_programme(
                self.session,
                scope_for("super_administrator"),
                name="Computing",
                slug="computing",
                category="Computing",
                status_value="available",
                duration_years=1,
                blurb="",
            )
            business = create_programme(
                self.session,
                scope_for("super_administrator"),
                name="Business",
                slug="business",
                category="Business",
                status_value="coming_soon",
                duration_years=1,
                blurb="",
            )
            archived = archive_programme(self.session, scope_for("super_administrator"), business.id)
        self.session.commit()
        self.assertEqual(archived.status, ProgrammeStatus.ARCHIVED)
        with self.assertRaises(HTTPException) as caught:
            reject_if_archived(archived)
        self.assertEqual(caught.exception.status_code, 422)
        reject_if_archived(computing)

        visible = programmes_for(self.session, scope_for("administrator", programmes={computing.id}))
        self.assertEqual([item.slug for item in visible], ["computing"])
        everything = programmes_for(self.session, scope_for("super_administrator"))
        self.assertEqual({item.slug for item in everything}, {"computing", "business"})

        with patch("app.programmes.write_audit"):
            restored = update_programme(
                self.session,
                scope_for("super_administrator"),
                business.id,
                name="Business",
                category="Business",
                status_value="available",
                duration_years=1,
                blurb="Restored.",
            )
        self.assertEqual(restored.status, ProgrammeStatus.AVAILABLE)

    def test_a_repeated_name_gets_a_distinct_slug(self) -> None:
        owner = scope_for("super_administrator")
        with patch("app.programmes.write_audit"):
            first = create_programme(
                self.session,
                owner,
                name="Computing",
                slug=None,
                category="Computing",
                status_value="preview",
                duration_years=1,
                blurb="",
            )
            second = create_programme(
                self.session,
                owner,
                name="Computing",
                slug=None,
                category="Computing",
                status_value="preview",
                duration_years=1,
                blurb="",
            )
        self.assertEqual(first.slug, "computing")
        self.assertEqual(second.slug, "computing-2")
