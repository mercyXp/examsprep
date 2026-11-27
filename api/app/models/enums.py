from enum import StrEnum

from sqlalchemy import Enum as SAEnum


class UserStatus(StrEnum):
    ACTIVE = "active"
    PENDING = "pending"
    SUSPENDED = "suspended"


class ProgrammeStatus(StrEnum):
    AVAILABLE = "available"
    COMING_SOON = "coming_soon"
    PREVIEW = "preview"
    ARCHIVED = "archived"


class ContentStatus(StrEnum):
    DRAFT = "DRAFT"
    IN_REVIEW = "IN_REVIEW"
    CHANGES_REQUESTED = "CHANGES_REQUESTED"
    APPROVED = "APPROVED"
    PUBLISHED = "PUBLISHED"
    UNPUBLISHED = "UNPUBLISHED"
    ARCHIVED = "ARCHIVED"


class VersionStatus(StrEnum):
    DRAFT = "DRAFT"
    IN_REVIEW = "IN_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    SUPERSEDED = "SUPERSEDED"


class ReviewDecision(StrEnum):
    APPROVE = "approve"
    REJECT = "reject"
    REQUEST_CHANGES = "request_changes"


class QuizKind(StrEnum):
    PRACTICE = "practice"
    MOCK = "mock"


class ResourceKind(StrEnum):
    PDF = "pdf"
    IMAGE = "image"
    DOCUMENT = "document"
    LINK = "link"


class EnrolmentStatus(StrEnum):
    ENROLLED = "enrolled"
    WITHDRAWN = "withdrawn"


class BookmarkTarget(StrEnum):
    LESSON = "lesson"
    QUIZ = "quiz"
    MODULE = "module"
    RESOURCE = "resource"


def pg_enum(enum_cls: type[StrEnum], name: str) -> SAEnum:
    return SAEnum(
        enum_cls,
        name=name,
        native_enum=True,
        values_callable=lambda items: [item.value for item in items],
        validate_strings=True,
    )


user_status_enum = pg_enum(UserStatus, "user_status")
programme_status_enum = pg_enum(ProgrammeStatus, "programme_status")
content_status_enum = pg_enum(ContentStatus, "content_status")
version_status_enum = pg_enum(VersionStatus, "version_status")
review_decision_enum = pg_enum(ReviewDecision, "review_decision")
quiz_kind_enum = pg_enum(QuizKind, "quiz_kind")
resource_kind_enum = pg_enum(ResourceKind, "resource_kind")
enrolment_status_enum = pg_enum(EnrolmentStatus, "enrolment_status")
bookmark_target_enum = pg_enum(BookmarkTarget, "bookmark_target")
