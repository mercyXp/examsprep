from uuid import UUID

from pydantic import BaseModel, Field


class SignupIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)


class UserOut(BaseModel):
    id: UUID
    name: str
    email: str
    roles: list[str]


class AuthOut(BaseModel):
    ok: bool = True
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ErrorOut(BaseModel):
    ok: bool = False
    message: str
