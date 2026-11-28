"""Upsert the published IT211 course without touching any other catalogue rows."""

from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.cms import slides_plain_text
from app.config import settings
from app.db import SessionLocal
from app.models import (
    AcademicYear,
    Chapter,
    Lesson,
    LessonVersion,
    Module,
    Programme,
    Question,
    QuestionVersion,
    Quiz,
    QuizVersion,
    QuizVersionQuestion,
    Role,
    Semester,
    StudentProfile,
    Topic,
    User,
    UserRole,
)
from app.models.enums import ContentStatus, ProgrammeStatus, QuizKind, UserStatus, VersionStatus
from app.security import hash_password
from app.seed.it211.slides import lesson_slides
from app.seed.it211.validate import load_course, validate_course

PROGRAMME_NAME = "Bachelor of Science in Computing"
MODULE_CODE = "IT211"
MODULE_NAME = "Systems Analysis and Design"


def _checksum(payload: object) -> str:
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _author(session: Session) -> User:
    user = session.scalar(
        select(User)
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .where(Role.slug == "super_administrator")
        .order_by(User.created_at)
    )
    if user is None:
        raise RuntimeError(
            "IT211 seed needs a super administrator. Set SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, "
            "and SUPER_ADMIN_PASSWORD and start the API once, or run python -m app.seed with "
            "SEED_DEMO_USERS=true, then run this command again."
        )
    return user


def _programme(session: Session) -> Programme:
    programme = session.scalar(select(Programme).where(Programme.name == PROGRAMME_NAME))
    if programme is None:
        programme = session.scalar(select(Programme).where(Programme.slug == "computing"))
    if programme is None:
        programme = Programme(
            slug="computing",
            name=PROGRAMME_NAME,
            category="Computing & Technology",
            status=ProgrammeStatus.AVAILABLE,
            duration_years=4,
            blurb="From programming and databases to systems analysis, one module at a time.",
        )
        session.add(programme)
        session.flush()
    if programme.name != PROGRAMME_NAME:
        raise RuntimeError(f"The computing programme is named {programme.name!r}, not {PROGRAMME_NAME!r}.")
    return programme


def _year_semester(session: Session, programme: Programme) -> Semester:
    year = session.scalar(
        select(AcademicYear).where(AcademicYear.programme_id == programme.id, AcademicYear.year_number == 2)
    )
    if year is None:
        year = AcademicYear(programme_id=programme.id, year_number=2)
        session.add(year)
        session.flush()
    semester = session.scalar(
        select(Semester).where(Semester.academic_year_id == year.id, Semester.semester_number == 1)
    )
    if semester is None:
        semester = Semester(academic_year_id=year.id, semester_number=1)
        session.add(semester)
        session.flush()
    return semester


def _module(session: Session, programme: Programme) -> Module:
    rows = list(
        session.scalars(
            select(Module)
            .join(Semester)
            .join(AcademicYear)
            .where(AcademicYear.programme_id == programme.id, Module.code == MODULE_CODE)
            .options(selectinload(Module.semester).selectinload(Semester.academic_year))
        ).unique()
    )
    module = rows[0] if rows else None
    if module is None:
        module = Module(
            semester_id=_year_semester(session, programme).id,
            code=MODULE_CODE,
            name=MODULE_NAME,
            credits=15,
            description="",
            objectives=[],
            status=ContentStatus.PUBLISHED,
        )
        session.add(module)
        session.flush()
    module.name = MODULE_NAME
    module.status = ContentStatus.PUBLISHED
    module.description = (
        "A second-year course on how analysts study a messy organisation, write requirements, "
        "model the system, design data and screens, and plan implementation, testing, and maintenance. "
        "Examples follow a Zambian university and the offices students already know."
    )
    module.objectives = [
        "Explain the systems analyst’s role in a real organisation",
        "Compare SDLC models and choose one for a given project",
        "Write functional and non-functional requirements",
        "Read and sketch UML, data-flow, and entity-relationship diagrams",
        "Describe conversion, testing, maintenance, and evaluation",
    ]
    return module


def _claim_position(session: Session, model: type, owner_id: uuid.UUID, module_id: uuid.UUID, desired: int) -> int:
    taken = {
        row.id: row.position
        for row in session.scalars(select(model).where(model.module_id == module_id))  # type: ignore[attr-defined]
    }
    if desired not in taken.values() or owner_id in {key for key, value in taken.items() if value == desired}:
        return desired
    used = set(taken.values())
    candidate = desired
    while candidate in used:
        candidate += 1
    return candidate


def _upsert_lesson(
    session: Session,
    module: Module,
    chapter: Chapter,
    author: User,
    chapter_position: int,
    lesson_position: int,
    document: dict[str, Any],
) -> Lesson:
    lesson = session.scalar(
        select(Lesson).where(Lesson.module_id == module.id, Lesson.title == document["title"])
    )
    if lesson is None:
        lesson = Lesson(
            module_id=module.id,
            chapter_id=chapter.id,
            creator_id=author.id,
            title=document["title"],
            description=document["description"],
            objectives=document["objectives"],
            duration_minutes=int(document["durationMinutes"]),
            difficulty=document.get("difficulty") or "beginner",
            position=0,
            status=ContentStatus.DRAFT,
        )
        session.add(lesson)
        session.flush()
    desired = chapter_position * 100 + lesson_position
    lesson.position = _claim_position(session, Lesson, lesson.id, module.id, desired)
    lesson.chapter_id = chapter.id
    lesson.description = document["description"]
    lesson.objectives = document["objectives"]
    lesson.duration_minutes = int(document["durationMinutes"])
    lesson.difficulty = document.get("difficulty") or "beginner"
    slides = lesson_slides(chapter_position, lesson_position, document)
    body = slides_plain_text(slides)
    digest = _checksum(slides)
    version = session.scalar(
        select(LessonVersion)
        .where(LessonVersion.lesson_id == lesson.id)
        .order_by(LessonVersion.version_number.desc())
    )
    if version is None:
        version = LessonVersion(
            lesson_id=lesson.id,
            version_number=1,
            body=body,
            slides=slides,
            checksum=digest,
            author_id=author.id,
            status=VersionStatus.APPROVED,
        )
        session.add(version)
        session.flush()
    elif version.checksum != digest:
        version.body = body
        version.slides = slides
        version.checksum = digest
        version.status = VersionStatus.APPROVED
        version.author_id = author.id
    lesson.published_version_id = version.id
    lesson.status = ContentStatus.PUBLISHED
    session.flush()
    return lesson


def _stable_choices(question_key: str, labels: list[str], correct_index: int) -> tuple[list[dict[str, str]], list[str]]:
    choices = []
    correct: list[str] = []
    for index, label in enumerate(labels):
        option_id = f"{question_key}-o{index}"
        choices.append({"id": option_id, "label": label})
        if index == correct_index:
            correct.append(option_id)
    return choices, correct


def _upsert_question(
    session: Session,
    module: Module,
    author: User,
    topic: Topic,
    quiz_code: str,
    number: int,
    document: dict[str, Any],
) -> tuple[QuestionVersion, int]:
    title = f"IT211 {quiz_code} {number:02d}"[:200]
    question = session.scalar(select(Question).where(Question.module_id == module.id, Question.title == title))
    kind = document["kind"]
    points = int(document.get("points") or (len(document.get("accepted") or []) if kind == "structured" else 1))
    if question is None:
        question = Question(
            module_id=module.id,
            creator_id=author.id,
            title=title,
            status=ContentStatus.DRAFT,
            topic_id=topic.id,
            kind=kind,
            source="manual",
        )
        session.add(question)
        session.flush()
    question.kind = kind
    question.topic_id = topic.id
    question.status = ContentStatus.PUBLISHED
    choices: list[dict[str, str]] = []
    correct_ids: list[str] = []
    accepted = [str(item) for item in document.get("accepted") or []]
    if kind in {"mcq", "true_false"}:
        labels = list(document["choices"])
        if kind == "true_false" and len(labels) < 2:
            labels = ["True", "False"]
        choices, correct_ids = _stable_choices(f"{quiz_code}-{number:02d}", labels, int(document["correct"]))
    payload = {
        "prompt": document["prompt"],
        "choices": choices,
        "correct": correct_ids,
        "explanation": document["explanation"],
        "accepted": accepted,
        "model": document.get("modelAnswer") or "",
    }
    digest = _checksum(payload)
    version = session.scalar(
        select(QuestionVersion)
        .where(QuestionVersion.question_id == question.id)
        .order_by(QuestionVersion.version_number.desc())
    )
    if version is None:
        version = QuestionVersion(
            question_id=question.id,
            version_number=1,
            prompt=document["prompt"],
            choices=choices,
            correct_option_ids=correct_ids,
            explanation=document["explanation"],
            model_answer=document.get("modelAnswer") or "",
            accepted_answers=accepted,
            checksum=digest,
            author_id=author.id,
            status=VersionStatus.APPROVED,
        )
        session.add(version)
        session.flush()
    elif version.checksum != digest:
        version.prompt = document["prompt"]
        version.choices = choices
        version.correct_option_ids = correct_ids
        version.explanation = document["explanation"]
        version.model_answer = document.get("modelAnswer") or ""
        version.accepted_answers = accepted
        version.checksum = digest
        version.status = VersionStatus.APPROVED
    question.published_version_id = version.id
    return version, points


def _topic(session: Session, module: Module, title: str, position: int) -> Topic:
    topic = session.scalar(select(Topic).where(Topic.module_id == module.id, Topic.title == title))
    if topic is not None:
        return topic
    used = set(session.scalars(select(Topic.position).where(Topic.module_id == module.id)))
    candidate = position
    while candidate in used:
        candidate += 1
    topic = Topic(module_id=module.id, title=title[:180], position=candidate)
    session.add(topic)
    session.flush()
    return topic


def _upsert_quiz(
    session: Session,
    module: Module,
    author: User,
    topics: dict[str, Topic],
    document: dict[str, Any],
) -> Quiz:
    quiz = session.scalar(select(Quiz).where(Quiz.module_id == module.id, Quiz.title == document["title"]))
    kind = QuizKind.MOCK if document["kind"] == "mock" else QuizKind.PRACTICE
    if quiz is None:
        quiz = Quiz(
            module_id=module.id,
            creator_id=author.id,
            title=document["title"][:200],
            kind=kind,
            status=ContentStatus.DRAFT,
        )
        session.add(quiz)
        session.flush()
    quiz.kind = kind
    quiz.status = ContentStatus.PUBLISHED
    links: list[tuple[QuestionVersion, int]] = []
    for number, question_doc in enumerate(document["questions"], start=1):
        topic = topics[question_doc["topic"]]
        version, points = _upsert_question(session, module, author, topic, document["code"], number, question_doc)
        links.append((version, points))
    version = session.scalar(
        select(QuizVersion).where(QuizVersion.quiz_id == quiz.id).order_by(QuizVersion.version_number.desc())
    )
    digest = _checksum(
        {
            "time": document.get("timeLimitSeconds"),
            "pass": document.get("passMarkPercent", 50),
            "questions": [(str(item.id), points) for item, points in links],
        }
    )
    if version is None:
        version = QuizVersion(
            quiz_id=quiz.id,
            version_number=1,
            time_limit_seconds=document.get("timeLimitSeconds"),
            pass_mark_percent=int(document.get("passMarkPercent", 50)),
            checksum=digest,
            author_id=author.id,
            status=VersionStatus.APPROVED,
        )
        session.add(version)
        session.flush()
    else:
        version.time_limit_seconds = document.get("timeLimitSeconds")
        version.pass_mark_percent = int(document.get("passMarkPercent", 50))
        version.checksum = digest
        version.status = VersionStatus.APPROVED
        for link in list(version.questions):
            session.delete(link)
        session.flush()
    for position, (question_version, points) in enumerate(links):
        session.add(
            QuizVersionQuestion(
                quiz_version_id=version.id,
                question_version_id=question_version.id,
                position=position,
                points=points,
            )
        )
    session.flush()
    quiz.published_version_id = version.id
    return quiz


def seed_demo_student(session: Session) -> str:
    """Create a student only in dev, and only from environment variables."""
    if not settings.seed_demo_users:
        return "Demo student skipped because SEED_DEMO_USERS is false."
    email = settings.demo_student_email.strip().lower()
    password = settings.demo_student_password
    if not email or not password:
        return "Demo student skipped. Set DEMO_STUDENT_EMAIL and DEMO_STUDENT_PASSWORD to create one."
    role = session.scalar(select(Role).where(Role.slug == "student"))
    if role is None:
        return "Demo student skipped because the student role is missing. Run python -m app.seed first."
    user = session.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(name="IT211 Demo Student", email=email, password_hash=hash_password(password), status=UserStatus.ACTIVE)
        session.add(user)
        session.flush()
    else:
        staff = session.scalar(
            select(Role.slug)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == user.id, Role.slug != "student")
        )
        if staff:
            return "Demo student skipped because that email already belongs to a staff account."
        user.password_hash = hash_password(password)
        user.status = UserStatus.ACTIVE
    if session.scalar(select(UserRole).where(UserRole.user_id == user.id, UserRole.role_id == role.id)) is None:
        session.add(UserRole(user_id=user.id, role_id=role.id))
    profile = session.get(StudentProfile, user.id)
    if profile is None:
        profile = StudentProfile(user_id=user.id)
        session.add(profile)
    profile.university = profile.university or "Cavendish University Zambia"
    profile.programme = PROGRAMME_NAME
    profile.year_of_study = profile.year_of_study or 2
    profile.semester_of_study = profile.semester_of_study or 1
    codes = [item for item in (profile.module_codes or []) if isinstance(item, str)]
    if MODULE_CODE not in codes:
        codes.append(MODULE_CODE)
    profile.module_codes = codes
    profile.onboarding_completed = True
    profile.onboarding_step = max(profile.onboarding_step or 0, 5)
    return f"Demo student ready for {email}."


def seed_it211(session: Session | None = None) -> dict[str, int]:
    counts = validate_course()
    chapters, assessments = load_course()
    own = session is None
    session = session or SessionLocal()
    try:
        author = _author(session)
        programme = _programme(session)
        module = _module(session, programme)
        topics: dict[str, Topic] = {}
        for chapter_doc in chapters:
            chapter = session.scalar(
                select(Chapter).where(Chapter.module_id == module.id, Chapter.title == chapter_doc["title"])
            )
            if chapter is None:
                chapter = Chapter(
                    module_id=module.id,
                    title=chapter_doc["title"],
                    description=chapter_doc["description"],
                    position=0,
                    status=ContentStatus.DRAFT,
                )
                session.add(chapter)
                session.flush()
            chapter.description = chapter_doc["description"]
            chapter.position = _claim_position(session, Chapter, chapter.id, module.id, int(chapter_doc["position"]))
            chapter.status = ContentStatus.PUBLISHED
            topics[chapter_doc["title"]] = _topic(session, module, chapter_doc["title"], int(chapter_doc["position"]))
            for index, lesson_doc in enumerate(chapter_doc["lessons"], start=1):
                _upsert_lesson(session, module, chapter, author, int(chapter_doc["position"]), index, lesson_doc)
        for quiz_doc in assessments["quizzes"]:
            _upsert_quiz(session, module, author, topics, quiz_doc)
        message = seed_demo_student(session)
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        if own:
            session.close()
    print(
        "IT211 seed complete: "
        f"{counts['chapters']} chapters, {counts['lessons']} lessons, "
        f"{counts['quizzes']} quizzes, {counts['questions']} questions."
    )
    print(message)
    print("Lessons are published. Re-running this command updates IT211 rows in place and leaves every other course alone.")
    return counts
