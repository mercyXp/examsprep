"""Idempotent seed: roles, permissions, Computing catalogue, coming-soon programmes."""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.db import SessionLocal
from app.access import ensure_program_module, sync_program_modules
from app.calendar import seed_demo_schedule
from app.models import (
    AcademicYear,
    Chapter,
    Lesson,
    LessonVersion,
    Module,
    Permission,
    Programme,
    Role,
    RolePermission,
    Semester,
    StudentProfile,
    User,
    UserRole,
)
from app.models.access import ContentCreatorAssignment, ProgramAdminAssignment
from app.models.enums import ContentStatus, ProgrammeStatus, UserStatus, VersionStatus
from app.security import hash_password

ROLES = [
    ("student", "Student", "Consumes published content and tracks personal progress."),
    ("creator", "Content creator", "Creates and edits lessons for assigned programme-module combinations."),
    ("administrator", "Program administrator", "Manages all modules and lessons within assigned programmes."),
    (
        "super_administrator",
        "Super administrator",
        "Assigns roles, owns platform configuration, and inspects audit logs.",
    ),
]

PERMISSIONS = [
    ("lesson:view_published", "View published lessons"),
    ("lesson:create", "Create lesson drafts"),
    ("lesson:edit_own", "Edit own drafts"),
    ("lesson:edit_any", "Edit another creator’s drafts"),
    ("lesson:submit", "Submit a version for review"),
    ("review:list", "List content reviews"),
    ("review:decide", "Approve, reject, or request changes"),
    ("lesson:publish", "Publish or unpublish an approved version"),
    ("user:manage_roles_limited", "Limited role management"),
    ("user:manage_roles", "Assign and revoke all roles"),
    ("audit:view_own", "View own audit activity"),
    ("audit:view_scoped", "View audit logs in an administrator’s scope"),
    ("audit:view_all", "View all audit logs"),
]

ROLE_PERMISSIONS: dict[str, tuple[str, ...]] = {
    "student": ("lesson:view_published", "audit:view_own"),
    "creator": (
        "lesson:view_published",
        "lesson:create",
        "lesson:edit_own",
        "lesson:submit",
        "audit:view_own",
    ),
    "administrator": (
        "lesson:view_published",
        "lesson:create",
        "lesson:edit_own",
        "lesson:edit_any",
        "lesson:submit",
        "review:list",
        "review:decide",
        "lesson:publish",
        "user:manage_roles_limited",
        "audit:view_scoped",
    ),
    "super_administrator": tuple(code for code, _ in PERMISSIONS),
}

COMING_SOON = [
    ("accounting-finance", "Accounting & Finance", "Accounting & Finance", "Numbers, business and financial thinking."),
    ("law", "Law", "Law", "Build knowledge through legal reasoning."),
    ("business-management", "Business & Management", "Business & Management", "Explore management, enterprise and strategy."),
    ("health-sciences", "Health Sciences", "Health Sciences", "Prepare for a future in health and medicine."),
]

DEMO_USERS = [
    ("Ada Student", "student@examsprep.local", "examsready", "student"),
    ("Cam Creator", "creator@examsprep.local", "examsready", "creator"),
    ("Sam Super", "super@examsprep.local", "examsready", "super_administrator"),
    ("Ann Admin", "admin@examsprep.local", "examsready", "administrator"),
]

Y2S1_MODULES = [
    ("IT211", "Systems Analysis and Design"),
    ("IT212", "Database Management Systems"),
    ("IT213", "Networking and Data Communication I"),
    ("IT214", "Operating Systems"),
    ("IT215", "Discrete Mathematics"),
]


def _get_or_create_role(session: Session, slug: str, name: str, description: str) -> Role:
    role = session.scalar(select(Role).where(Role.slug == slug))
    if role is None:
        role = Role(slug=slug, name=name, description=description)
        session.add(role)
        session.flush()
        return role
    role.name = name
    role.description = description
    return role


def _get_or_create_permission(session: Session, code: str, description: str) -> Permission:
    permission = session.scalar(select(Permission).where(Permission.code == code))
    if permission is None:
        permission = Permission(code=code, description=description)
        session.add(permission)
        session.flush()
        return permission
    permission.description = description
    return permission


def seed_identity(session: Session) -> None:
    roles = {
        slug: _get_or_create_role(session, slug, name, description)
        for slug, name, description in ROLES
    }
    permissions = {
        code: _get_or_create_permission(session, code, description)
        for code, description in PERMISSIONS
    }
    for slug, codes in ROLE_PERMISSIONS.items():
        role = roles[slug]
        for code in codes:
            permission = permissions[code]
            exists = session.scalar(
                select(RolePermission).where(
                    RolePermission.role_id == role.id,
                    RolePermission.permission_id == permission.id,
                )
            )
            if exists is None:
                session.add(RolePermission(role_id=role.id, permission_id=permission.id))


def seed_programmes(session: Session) -> None:
    computing = session.scalar(select(Programme).where(Programme.slug == "computing"))
    if computing is None:
        computing = Programme(
            slug="computing",
            name="Bachelor of Science in Computing",
            category="Computing & Technology",
            status=ProgrammeStatus.AVAILABLE,
            duration_years=4,
            blurb=(
                "From programming and databases to artificial intelligence, "
                "build your understanding one module at a time."
            ),
        )
        session.add(computing)
        session.flush()
    else:
        computing.status = ProgrammeStatus.AVAILABLE
        computing.duration_years = 4

    for year_number in range(1, 5):
        year = session.scalar(
            select(AcademicYear).where(
                AcademicYear.programme_id == computing.id,
                AcademicYear.year_number == year_number,
            )
        )
        if year is None:
            year = AcademicYear(programme_id=computing.id, year_number=year_number)
            session.add(year)
            session.flush()
        for semester_number in (1, 2):
            semester = session.scalar(
                select(Semester).where(
                    Semester.academic_year_id == year.id,
                    Semester.semester_number == semester_number,
                )
            )
            if semester is None:
                session.add(Semester(academic_year_id=year.id, semester_number=semester_number))
                session.flush()

    y2s1 = session.scalar(
        select(Semester)
        .join(AcademicYear)
        .where(
            AcademicYear.programme_id == computing.id,
            AcademicYear.year_number == 2,
            Semester.semester_number == 1,
        )
    )
    assert y2s1 is not None
    existing_codes = set(session.scalars(select(Module.code).where(Module.semester_id == y2s1.id)))
    descriptions = {
        "IT211": "Analyse business problems and design information systems that people can actually use.",
        "IT212": "Design, query, and manage relational databases, from tables through SQL to integrity.",
        "IT213": "Understand how computers exchange data across local and wide-area networks.",
        "IT214": "Study processes, memory, files, and the software that manages a computer’s resources.",
        "IT215": "Build the mathematical reasoning used in computing: logic, sets, graphs, and proofs.",
    }
    objectives = {
        "IT211": ["Model a system with diagrams", "Gather and document requirements", "Propose a workable design"],
        "IT212": ["Write SQL to query data", "Design normalised tables", "Explain keys and relationships"],
        "IT213": ["Describe the OSI layers", "Compare common network media", "Identify addressing basics"],
        "IT214": ["Explain process scheduling", "Describe memory management", "Outline file-system roles"],
        "IT215": ["Use propositional logic", "Work with sets and relations", "Read a simple graph argument"],
    }
    for code, name in Y2S1_MODULES:
        if code not in existing_codes:
            session.add(
                Module(
                    semester_id=y2s1.id,
                    code=code,
                    name=name,
                    description=descriptions.get(code, ""),
                    objectives=objectives.get(code, []),
                    status=ContentStatus.PUBLISHED,
                )
            )
        else:
            row = session.scalar(select(Module).where(Module.semester_id == y2s1.id, Module.code == code))
            if row is not None and not row.description:
                row.description = descriptions.get(code, "")
                row.objectives = objectives.get(code, [])
                row.status = ContentStatus.PUBLISHED

    for slug, name, category, blurb in COMING_SOON:
        row = session.scalar(select(Programme).where(Programme.slug == slug))
        if row is None:
            session.add(
                Programme(
                    slug=slug,
                    name=name,
                    category=category,
                    status=ProgrammeStatus.COMING_SOON,
                    blurb=blurb,
                )
            )


def seed_demo_users(session: Session) -> None:
    if not settings.seed_demo_users:
        return

    for name, email, password, role_slug in DEMO_USERS:
        role = session.scalar(select(Role).where(Role.slug == role_slug))
        if role is None:
            continue
        if role_slug == "super_administrator":
            real_super = session.scalar(
                select(User.id)
                .join(UserRole, UserRole.user_id == User.id)
                .join(Role, Role.id == UserRole.role_id)
                .where(Role.slug == "super_administrator", User.email != email)
            )
            if real_super is not None:
                continue
        user = session.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                name=name,
                email=email,
                password_hash=hash_password(password),
                status=UserStatus.ACTIVE,
            )
            session.add(user)
            session.flush()
        else:
            user.name = name
            user.password_hash = hash_password(password)
            user.status = UserStatus.ACTIVE
        already = session.scalar(
            select(UserRole).where(UserRole.user_id == user.id, UserRole.role_id == role.id)
        )
        if already is None:
            session.add(UserRole(user_id=user.id, role_id=role.id))

        if role_slug == "student":
            profile = session.get(StudentProfile, user.id)
            if profile is None:
                profile = StudentProfile(user_id=user.id)
                session.add(profile)
            profile.university = "Cavendish University Zambia"
            profile.programme = "Bachelor of Science in Computing"
            profile.year_of_study = 2
            profile.semester_of_study = 1
            profile.exam_date = date(2026, 11, 23)
            profile.exam_dates = ["2026-11-23"]
            profile.exam_timetable = {}
            profile.daily_goal_minutes = 60
            profile.pace = "balanced"
            profile.study_days = ["mon", "tue", "wed", "thu", "fri"]
            profile.module_codes = ["IT211", "IT212", "IT213", "IT214", "IT215"]
            profile.module_exam_plans = {
                code: {"examType": "regular", "dateMode": "official", "estimatedDate": None}
                for code in profile.module_codes
            }
            profile.onboarding_step = 5
            profile.onboarding_completed = True


def seed_assignments(session: Session) -> None:
    sync_program_modules(session)
    computing = session.scalar(select(Programme).where(Programme.slug == "computing"))
    admin = session.scalar(select(User).where(User.email == "admin@examsprep.local"))
    creator = session.scalar(select(User).where(User.email == "creator@examsprep.local"))
    if computing is None:
        return
    if admin is not None:
        exists = session.scalar(
            select(ProgramAdminAssignment).where(
                ProgramAdminAssignment.user_id == admin.id,
                ProgramAdminAssignment.programme_id == computing.id,
            )
        )
        if exists is None:
            session.add(ProgramAdminAssignment(user_id=admin.id, programme_id=computing.id, assigned_by_id=admin.id))
    for code in ("IT212", "IT213"):
        module = session.scalars(
            select(Module).options(joinedload(Module.semester).joinedload(Semester.academic_year)).where(Module.code == code)
        ).unique().one_or_none()
        if creator is None or module is None:
            continue
        link = ensure_program_module(session, module)
        if link is None:
            continue
        exists = session.scalar(
            select(ContentCreatorAssignment).where(
                ContentCreatorAssignment.user_id == creator.id,
                ContentCreatorAssignment.program_module_id == link.id,
            )
        )
        if exists is None:
            session.add(
                ContentCreatorAssignment(
                    user_id=creator.id,
                    program_module_id=link.id,
                    assigned_by_id=admin.id if admin else None,
                )
            )


def seed_sample_lesson(session: Session) -> None:
    module = session.scalar(select(Module).where(Module.code == "IT212"))
    admin = session.scalar(select(User).where(User.email == "admin@examsprep.local"))
    if module is None or admin is None:
        return
    chapter = session.scalar(select(Chapter).where(Chapter.module_id == module.id, Chapter.title == "SQL Fundamentals"))
    if chapter is None:
        chapter = Chapter(
            module_id=module.id,
            title="SQL Fundamentals",
            description="The language used to ask questions of a relational database.",
            position=0,
            status=ContentStatus.PUBLISHED,
        )
        session.add(chapter)
        session.flush()
    lesson = session.scalar(select(Lesson).where(Lesson.module_id == module.id, Lesson.title == "Introduction to SQL"))
    if lesson is None:
        lesson = Lesson(
            module_id=module.id,
            chapter_id=chapter.id,
            creator_id=admin.id,
            title="Introduction to SQL",
            description="What SQL is, why it matters, and how a first SELECT statement is written.",
            objectives=["Explain what SQL is used for", "Read a simple SELECT statement", "Recognise a table as rows and columns"],
            duration_minutes=18,
            difficulty="beginner",
            position=0,
            status=ContentStatus.PUBLISHED,
        )
        session.add(lesson)
        session.flush()
    slides = [
        {
            "id": "slide-sql-1",
            "title": "What is SQL?",
            "layout": "text",
            "revealMode": "block",
            "titleImmediate": True,
            "transition": "fade",
            "blocks": [
                {
                    "id": "b1",
                    "type": "text",
                    "variant": "heading",
                    "text": "SQL is how we talk to a database.",
                    "items": [],
                    "appear": "immediate",
                    "animation": "fade",
                },
                {
                    "id": "b2",
                    "type": "text",
                    "variant": "paragraph",
                    "text": "SQL stands for Structured Query Language.",
                    "items": [],
                    "appear": "click",
                    "animation": "up",
                },
                {
                    "id": "b2b",
                    "type": "text",
                    "variant": "paragraph",
                    "text": "It is the standard way to create, read, update, and delete data in a relational database.",
                    "items": [],
                    "appear": "click",
                    "animation": "up",
                },
                {
                    "id": "b2c",
                    "type": "text",
                    "variant": "paragraph",
                    "text": "Instead of opening a spreadsheet by hand, you write a precise request and the database engine returns exactly the rows you asked for.",
                    "items": [],
                    "appear": "click",
                    "animation": "up",
                },
                {
                    "id": "b3",
                    "type": "callout",
                    "tone": "tip",
                    "text": "Think of a table as a named grid: columns describe the kind of data, and each row is one record.",
                    "appear": "click",
                    "animation": "fade",
                },
            ],
        },
        {
            "id": "slide-sql-2",
            "title": "A first SELECT",
            "layout": "code",
            "revealMode": "block",
            "titleImmediate": True,
            "blocks": [
                {
                    "id": "b4",
                    "type": "text",
                    "variant": "paragraph",
                    "text": "The SELECT statement asks for columns from a table.",
                    "items": [],
                    "appear": "click",
                    "animation": "fade",
                },
                {
                    "id": "b4b",
                    "type": "text",
                    "variant": "paragraph",
                    "text": "FROM names the table. A semicolon ends the statement.",
                    "items": [],
                    "appear": "click",
                    "animation": "up",
                },
                {
                    "id": "b5",
                    "type": "code",
                    "language": "sql",
                    "code": "SELECT student_name, email\nFROM students;",
                    "appear": "click",
                    "animation": "zoom",
                },
                {
                    "id": "b6",
                    "type": "text",
                    "variant": "definition",
                    "text": "SELECT lists the columns to return. FROM names the table those columns come from.",
                    "items": [],
                    "appear": "click",
                    "animation": "fade",
                },
            ],
        },
        {
            "id": "slide-sql-3",
            "title": "Check your understanding",
            "layout": "assessment",
            "revealMode": "block",
            "titleImmediate": True,
            "blocks": [
                {
                    "id": "b7",
                    "type": "text",
                    "variant": "paragraph",
                    "text": "Before you move on, confirm the role of SELECT. A knowledge check is required to complete this lesson.",
                    "items": [],
                    "appear": "click",
                    "animation": "fade",
                },
                {
                    "id": "b8",
                    "type": "check",
                    "prompt": "What does a SELECT statement do?",
                    "options": [
                        {"id": "opt-a", "label": "Deletes a table from the database"},
                        {"id": "opt-b", "label": "Asks the database to return specified columns from a table"},
                        {"id": "opt-c", "label": "Creates a new user account"},
                    ],
                    "correctId": "opt-b",
                    "explanation": "SELECT retrieves data. It does not remove tables or create users.",
                    "feedbackCorrect": "That’s right. SELECT reads data; it does not change the table structure.",
                    "feedbackWrong": "SELECT is a query. It returns rows; it does not delete tables or create accounts.",
                    "appear": "click",
                    "animation": "fade",
                },
            ],
        },
    ]
    version = session.scalar(
        select(LessonVersion).where(LessonVersion.lesson_id == lesson.id).order_by(LessonVersion.version_number.desc())
    )
    if version is None:
        version = LessonVersion(
            lesson_id=lesson.id,
            version_number=1,
            body="SQL is how we talk to a database.",
            slides=slides,
            author_id=admin.id,
            status=VersionStatus.APPROVED,
        )
        session.add(version)
    else:
        version.slides = slides
        version.body = "SQL is how we talk to a database."
        version.status = VersionStatus.APPROVED
    session.flush()
    lesson.published_version_id = version.id
    lesson.status = ContentStatus.PUBLISHED


def seed(session: Session | None = None) -> None:
    own_session = session is None
    session = session or SessionLocal()
    try:
        seed_identity(session)
        seed_programmes(session)
        seed_demo_users(session)
        seed_sample_lesson(session)
        seed_assignments(session)
        seed_demo_schedule(session)
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        if own_session:
            session.close()


if __name__ == "__main__":
    seed()
    print("Seed complete.")
    if settings.seed_demo_users:
        print("Demo logins (password: examsready)")
        print("  student@examsprep.local")
        print("  creator@examsprep.local")
        print("  admin@examsprep.local")
        print("  super@examsprep.local")
