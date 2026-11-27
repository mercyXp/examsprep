"""Who may open, fund, and settle a prize pool.

Super administrators may manage every pool, including a platform-wide pool
with no programme. A programme administrator may manage pools only for a
programme they are assigned to. Creators and students may not. The route
depends on this function, not on which button the website shows.
"""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status

from app.access import AccessScope


def assert_rewards_viewer(scope: AccessScope) -> None:
    if scope.super_admin or "administrator" in scope.roles:
        return
    raise HTTPException(
        status.HTTP_403_FORBIDDEN,
        "Only a super administrator or a programme administrator can view rewards.",
    )


def assert_pool_admin(scope: AccessScope, programme_id: uuid.UUID | None) -> None:
    if scope.super_admin:
        return
    if "administrator" not in scope.roles:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Only a super administrator or a programme administrator can manage prize pools.",
        )
    if programme_id is None or not scope.allows_programme(programme_id):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "That prize pool is outside the programmes you administer.",
        )
