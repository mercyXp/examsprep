"""Scope checks for import, copy, and generated drafts.

Publishing stays on the existing review endpoints. These helpers only confirm
that an editor may touch the modules involved, and that a client cannot mark
generated content as published.
"""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status

from app.access import AccessScope

DRAFT_STATUS = "DRAFT"


def ensure_editor_scope(scope: AccessScope, *module_ids: uuid.UUID) -> None:
    """Require every module. Copying checks the source and the destination."""
    seen: list[uuid.UUID] = []
    for module_id in module_ids:
        if module_id in seen:
            continue
        seen.append(module_id)
        scope.require_module(module_id)


def ensure_client_cannot_publish(status_value: str | None) -> None:
    if (status_value or "").strip().upper() == "PUBLISHED":
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Imported and generated lessons stay in draft until a reviewer publishes them.",
        )


def force_draft(_status_value: str | None = None) -> str:
    """Generated questions and lessons are always drafts, whatever the caller sends."""
    return DRAFT_STATUS
