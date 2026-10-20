from datetime import date
import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import User
from app.profile import DEFAULT_EXAM, ensure_profile, user_out
from app.schemas import OnboardingIn, UserOut
from app.security import require_user

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])

ALLOWED_PACES = {"relaxed", "balanced", "intensive"}
ALLOWED_DAYS = {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}
ALLOWED_MODULES = {"IT211", "IT212", "IT213", "IT214", "IT215"}
ALLOWED_PROGRAMMES = {"Bachelor of Science in Computing"}
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _clean_dates(values: list[str] | None) -> list[str]:
    cleaned: list[str] = []
    for item in values or []:
        if not DATE_RE.match(item):
            continue
        try:
            date.fromisoformat(item)
        except ValueError:
            continue
        if item not in cleaned:
            cleaned.append(item)
    cleaned.sort()
    return cleaned


@router.get("", response_model=UserOut)
def get_onboarding(user: User = Depends(require_user), session: Session = Depends(get_session)) -> UserOut:
    ensure_profile(session, user)
    return user_out(user)


@router.patch("", response_model=UserOut)
def save_onboarding(
    body: OnboardingIn,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
) -> UserOut:
    profile = ensure_profile(session, user)

    if body.name is not None:
        name = body.name.strip()
        if name:
            user.name = name
    if body.university is not None:
        profile.university = body.university.strip() or None
    if body.programme is not None:
        profile.programme = body.programme.strip() or None
    if body.year_of_study is not None:
        profile.year_of_study = body.year_of_study
    if body.semester_of_study is not None:
        profile.semester_of_study = body.semester_of_study
    if body.exam_date is not None:
        profile.exam_date = body.exam_date
    if body.exam_dates is not None:
        profile.exam_dates = _clean_dates(body.exam_dates)
        if profile.exam_dates:
            profile.exam_date = date.fromisoformat(profile.exam_dates[0])
        allowed = set(profile.exam_dates)
        table = dict(profile.exam_timetable or {})
        profile.exam_timetable = {code: day for code, day in table.items() if day in allowed}
    if body.exam_timetable is not None:
        allowed = set(profile.exam_dates or [])
        if not allowed and profile.exam_date is not None:
            allowed = {profile.exam_date.isoformat()}
        cleaned: dict[str, str] = {}
        for code, day in body.exam_timetable.items():
            if code not in ALLOWED_MODULES or not DATE_RE.match(day):
                continue
            if allowed and day not in allowed:
                continue
            cleaned[code] = day
        profile.exam_timetable = cleaned
    if body.daily_goal_minutes is not None:
        profile.daily_goal_minutes = body.daily_goal_minutes
    if body.pace is not None and body.pace in ALLOWED_PACES:
        profile.pace = body.pace
    if body.study_days is not None:
        profile.study_days = [day for day in body.study_days if day in ALLOWED_DAYS]
    if body.module_codes is not None:
        profile.module_codes = [code for code in body.module_codes if code in ALLOWED_MODULES]
    advancing = body.complete or (body.onboarding_step is not None and body.onboarding_step >= 3)
    if advancing and (
        profile.programme not in ALLOWED_PROGRAMMES
        or profile.year_of_study is None
        or profile.semester_of_study is None
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Programme, year of study, and semester are required.",
        )
    if body.onboarding_step is not None:
        profile.onboarding_step = max(profile.onboarding_step, body.onboarding_step)
    if body.complete:
        profile.onboarding_completed = True
        profile.onboarding_step = 5
        if not profile.module_codes:
            profile.module_codes = sorted(ALLOWED_MODULES)
        if not profile.study_days:
            profile.study_days = ["mon", "tue", "wed", "thu", "fri"]
        if profile.exam_date is None:
            profile.exam_date = DEFAULT_EXAM
        if not profile.exam_dates:
            profile.exam_dates = [profile.exam_date.isoformat()]

    session.add(user)
    session.add(profile)
    session.flush()
    return user_out(user)
