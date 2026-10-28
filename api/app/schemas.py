from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field


class SignupIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class GoogleIn(BaseModel):
    access_token: str = Field(min_length=20, max_length=4096)


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=20, max_length=256)
    password: str = Field(min_length=8, max_length=128)


class MessageOut(BaseModel):
    ok: bool = True
    message: str


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class PasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
    id: UUID
    name: str
    email: str
    roles: list[str]
    onboarding_completed: bool = False
    onboarding_step: int = 1
    university: str | None = None
    programme: str | None = None
    year_of_study: int | None = None
    semester_of_study: int | None = None
    exam_date: date = date(2026, 11, 23)
    exam_dates: list[str] = Field(default_factory=list)
    exam_timetable: dict[str, str] = Field(default_factory=dict)
    daily_goal_minutes: int = 60
    pace: str = "balanced"
    study_days: list[str] = Field(default_factory=list)
    module_codes: list[str] = Field(default_factory=list)
    module_exam_plans: dict[str, dict] = Field(default_factory=dict)
    revision_start: date | None = None


class OnboardingIn(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    university: str | None = Field(default=None, max_length=160)
    programme: str | None = Field(default=None, max_length=160)
    year_of_study: int | None = Field(default=None, ge=1, le=4)
    semester_of_study: int | None = Field(default=None, ge=1, le=2)
    exam_date: date | None = None
    exam_dates: list[str] | None = None
    exam_timetable: dict[str, str] | None = None
    daily_goal_minutes: int | None = Field(default=None, ge=15, le=240)
    pace: str | None = Field(default=None, max_length=16)
    study_days: list[str] | None = None
    module_codes: list[str] | None = None
    module_exam_plans: dict[str, dict] | None = None
    revision_start: date | None = None
    onboarding_step: int | None = Field(default=None, ge=1, le=5)
    complete: bool = False


class AuthOut(BaseModel):
    ok: bool = True
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ErrorOut(BaseModel):
    ok: bool = False
    message: str
