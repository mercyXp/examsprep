"""How an offline progress sync meets the row already stored.

The website saves progress with no idempotency key, and that path is unchanged.
A phone sync sends Idempotency-Key. That path must not walk a lesson backwards
or wipe a completion that already landed, including when the response was lost
and the phone sends the same payload again.
"""

from __future__ import annotations


def merge_slide_progress(
    *,
    server_index: int,
    server_revealed: int,
    server_completed: bool,
    incoming_index: int,
    incoming_revealed: int,
    incoming_completed: bool,
    checks_passed: bool,
    at_end: bool,
    guarded: bool,
) -> tuple[int, int, bool, str | None]:
    """Return slide index, revealed units, whether the lesson stays complete, and a conflict note."""
    wants_complete = bool(incoming_completed and at_end and checks_passed)
    if not guarded:
        index = incoming_index
        revealed = incoming_revealed
        if wants_complete:
            return index, revealed, True, None
        if not checks_passed:
            return index, revealed, False, None
        return index, revealed, server_completed, None

    conflict: str | None = None
    index = incoming_index
    revealed = incoming_revealed
    if incoming_index < server_index:
        index = server_index
        conflict = "kept-server-slide"
    if incoming_revealed < server_revealed and index == server_index:
        revealed = server_revealed
        conflict = conflict or "kept-server-reveal"
    completed = wants_complete or server_completed
    if server_completed and not wants_complete:
        conflict = conflict or "kept-server-completion"
    return index, revealed, completed, conflict
