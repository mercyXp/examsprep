from datetime import date

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import StudentProfile, User
from app.schemas import UserOut
from app.security import role_slugs

DEFAULT_EXAM = date(2026, 11, 23)


def is_student(user: User) -> bool:
    return "student" in role_slugs(user)


def ensure_profile(session: Session, user: User) -> StudentProfile:
    if user.profile is not None:
        return user.profile
    existing = session.get(StudentProfile, user.id)
    if existing is not None:
        user.profile = existing
        return existing
    profile = StudentProfile(
        user_id=user.id,
        exam_date=DEFAULT_EXAM,
        exam_dates=[],
        exam_timetable={},
        daily_goal_minutes=60,
        pace="balanced",
        study_days=["mon", "tue", "wed", "thu", "fri"],
        module_codes=[],
        module_exam_plans={},
        onboarding_step=1,
        onboarding_completed=False,
    )
    try:
        with session.begin_nested():
            session.add(profile)
            session.flush()
    except IntegrityError:
        existing = session.get(StudentProfile, user.id)
        if existing is None:
            raise
        user.profile = existing
        return existing
    user.profile = profile
    return profile


def user_out(user: User) -> UserOut:
    profile = user.profile
    completed = True if not is_student(user) else bool(profile and profile.onboarding_completed)
    return UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        roles=role_slugs(user),
        onboarding_completed=completed,
        onboarding_step=profile.onboarding_step if profile else 1,
        university=profile.university if profile else None,
        programme=profile.programme if profile else None,
        year_of_study=profile.year_of_study if profile else None,
        semester_of_study=profile.semester_of_study if profile else None,
        exam_date=profile.exam_date if profile else DEFAULT_EXAM,
        exam_dates=_exam_dates(profile),
        exam_timetable=dict(profile.exam_timetable or {}) if profile else {},
        daily_goal_minutes=profile.daily_goal_minutes if profile else 60,
        pace=profile.pace if profile else "balanced",
        study_days=list(profile.study_days or []) if profile else [],
        module_codes=list(profile.module_codes or []) if profile else [],
        module_exam_plans=dict(profile.module_exam_plans or {}) if profile else {},
        revision_start=profile.revision_start if profile else None,
    )


def _exam_dates(profile: StudentProfile | None) -> list[str]:
    if profile is None:
        return []
    dates = [item for item in (profile.exam_dates or []) if isinstance(item, str)]
    if dates:
        return sorted(set(dates))
    if profile.exam_date is not None:
        return [profile.exam_date.isoformat()]
    return []

