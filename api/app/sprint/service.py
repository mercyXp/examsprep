"""Persist ExamSprint runs. The engine decides the score; this module only stores it."""

from __future__ import annotations

import copy
import hashlib
import secrets
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import User
from app.models.sprint import SprintAchievement, SprintSession
from app.sprint.bank import deal
from app.sprint.engine import (
    ACHIEVEMENTS,
    Run,
    apply_answer,
    apply_continue,
    apply_quit,
    new_run,
    public_state,
    resolve_letter,
    unlocked_codes,
)

ACTIVE_AGENT_CAP = 100


def now_ms(moment: datetime | None = None) -> int:
    current = moment or datetime.now(UTC)
    return int(current.timestamp() * 1000)


def _hash_key(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _run_from_row(row: SprintSession) -> Run:
    return Run(
        player_kind=row.player_kind,
        subject_id=row.subject_id,
        subject_name=row.subject_name,
        source=row.source,
        deck=copy.deepcopy(row.deck or []),
        index=row.question_index,
        status=row.status,
        phase=row.phase,
        score=row.score,
        speed_bonus=row.speed_bonus,
        correct=row.correct_count,
        streak=row.streak,
        best_streak=row.best_streak,
        moves=row.moves,
        answers=copy.deepcopy(row.answers or []),
        last_move_id=row.last_move_id,
        shown_at_ms=int(row.question_started_ms or 0),
        outcome=row.outcome or "",
        round_size=row.round_size,
        limit_ms=row.limit_ms,
        display_name=row.display_name,
    )


def _save_run(row: SprintSession, run: Run, moment: datetime) -> None:
    row.status = run.status
    row.phase = run.phase
    row.outcome = run.outcome
    row.score = run.score
    row.speed_bonus = run.speed_bonus
    row.correct_count = run.correct
    row.streak = run.streak
    row.best_streak = run.best_streak
    row.moves = run.moves
    row.question_index = run.index
    row.question_started_ms = run.shown_at_ms
    row.last_move_id = run.last_move_id
    row.deck = copy.deepcopy(run.deck)
    row.answers = copy.deepcopy(run.answers)
    if run.status == "finished" and row.finished_at is None:
        row.finished_at = moment


def _held_codes(session: Session, player_key: str) -> set[str]:
    return set(
        session.scalars(select(SprintAchievement.code).where(SprintAchievement.player_key == player_key)).all()
    )


def _achievement_views(session: Session, row: SprintSession, run: Run, *, grant: bool) -> list[dict]:
    qualified = unlocked_codes(run)
    if not qualified:
        return []
    existing = _held_codes(session, row.player_key)
    views: list[dict] = []
    for code in qualified:
        fresh = code not in existing
        if fresh and grant:
            session.add(SprintAchievement(player_key=row.player_key, code=code, session_id=row.id))
            existing.add(code)
        elif fresh:
            continue
        title, detail = ACHIEVEMENTS[code]
        views.append({"code": code, "title": title, "detail": detail, "new": fresh and grant})
    if grant:
        session.flush()
    return views


def present(session: Session, row: SprintSession, moment: datetime, *, grant: bool) -> dict:
    run = _run_from_row(row)
    state = public_state(run, now_ms(moment))
    state["sessionId"] = str(row.id)
    state["runId"] = str(row.id)
    state["achievements"] = _achievement_views(session, row, run, grant=grant)
    return state


def _open(
    session: Session,
    *,
    user_id: uuid.UUID | None,
    player_key: str,
    player_kind: str,
    display_name: str,
    subject_id: str,
    subject_name: str,
    source: str,
    deck: list[dict],
    moment: datetime,
    agent_key: str | None,
) -> tuple[SprintSession, dict]:
    run = new_run(
        player_kind=player_kind,
        subject_id=subject_id,
        subject_name=subject_name,
        source=source,
        deck=deck,
        now_ms=now_ms(moment),
        display_name=display_name,
    )
    row = SprintSession(
        user_id=user_id,
        player_key=player_key,
        player_kind=player_kind,
        display_name=display_name[:80],
        agent_key_hash=_hash_key(agent_key) if agent_key else None,
        subject_id=subject_id,
        subject_name=subject_name[:180],
        source=source,
        status=run.status,
        phase=run.phase,
        outcome="",
        score=0,
        speed_bonus=0,
        correct_count=0,
        streak=0,
        best_streak=0,
        moves=0,
        question_index=0,
        question_started_ms=run.shown_at_ms,
        round_size=run.round_size,
        limit_ms=run.limit_ms,
        deck=copy.deepcopy(deck),
        answers=[],
    )
    session.add(row)
    session.flush()
    return row, present(session, row, moment, grant=False)


def _abandon_open(session: Session, user: User, moment: datetime) -> None:
    rows = session.scalars(
        select(SprintSession).where(SprintSession.user_id == user.id, SprintSession.status == "playing")
    ).all()
    for row in rows:
        row.status = "finished"
        row.phase = "finished"
        row.outcome = "quit"
        row.finished_at = moment


def start_human(session: Session, user: User, subject_id: str, moment: datetime | None = None) -> dict:
    current = moment or datetime.now(UTC)
    _abandon_open(session, user, current)
    subject, name, source, deck = deal(session, subject_id or "practice")
    _row, state = _open(
        session,
        user_id=user.id,
        player_key=str(user.id),
        player_kind="human",
        display_name=user.name,
        subject_id=subject,
        subject_name=name,
        source=source,
        deck=deck,
        moment=current,
        agent_key=None,
    )
    state["ok"] = True
    return state


def start_agent(session: Session, agent_name: str, subject_id: str | None, moment: datetime | None = None) -> dict:
    current = moment or datetime.now(UTC)
    cleaned = " ".join(agent_name.strip().split())
    if not cleaned or len(cleaned) > 40:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Agent name must be 1 to 40 characters.")
    playing = session.scalar(
        select(func.count())
        .select_from(SprintSession)
        .where(SprintSession.player_kind == "agent", SprintSession.status == "playing")
    )
    if int(playing or 0) >= ACTIVE_AGENT_CAP:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many agent runs are in progress. Try again shortly.",
        )
    subject, name, source, deck = deal(session, (subject_id or "practice").strip() or "practice")
    api_key = secrets.token_urlsafe(24)
    _row, state = _open(
        session,
        user_id=None,
        player_key=f"agent:{cleaned.casefold()}",
        player_kind="agent",
        display_name=cleaned,
        subject_id=subject,
        subject_name=name,
        source=source,
        deck=deck,
        moment=current,
        agent_key=api_key,
    )
    state["apiKey"] = api_key
    return state


def read_human(session: Session, user: User, session_id: uuid.UUID, moment: datetime | None = None) -> dict:
    current = moment or datetime.now(UTC)
    row = row_for_user(session, user, session_id)
    state = present(session, row, current, grant=False)
    state["ok"] = True
    return state


def row_for_user(session: Session, user: User, session_id: uuid.UUID) -> SprintSession:
    row = session.get(SprintSession, session_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That run does not exist.")
    return row


def row_for_agent_key(session: Session, token: str) -> SprintSession:
    if not token:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Send the apiKey from the start of the run as a Bearer token.",
        )
    row = session.scalar(select(SprintSession).where(SprintSession.agent_key_hash == _hash_key(token)))
    if row is None or row.player_kind != "agent":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "That apiKey does not match an agent run.")
    return row


def row_for_watch(session: Session, session_id: uuid.UUID) -> SprintSession:
    row = session.get(SprintSession, session_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That run does not exist.")
    return row


def active_human(session: Session, user: User, moment: datetime | None = None) -> dict:
    current = moment or datetime.now(UTC)
    row = session.scalar(
        select(SprintSession)
        .where(SprintSession.user_id == user.id, SprintSession.status == "playing")
        .order_by(SprintSession.created_at.desc())
    )
    if row is None:
        return {"ok": True, "session": None}
    return {"ok": True, "session": present(session, row, current, grant=False)}


def _mutate(session: Session, row: SprintSession, run: Run, error: str | None, moment: datetime) -> dict:
    if error is None:
        _save_run(row, run, moment)
        session.flush()
        state = present(session, row, moment, grant=True)
    else:
        state = present(session, row, moment, grant=False)
        state["error"] = error
    return state


def answer_human(
    session: Session,
    user: User,
    session_id: uuid.UUID,
    *,
    choice_id: str | None,
    move_id: str,
    moment: datetime | None = None,
) -> dict:
    current = moment or datetime.now(UTC)
    row = row_for_user(session, user, session_id)
    run = _run_from_row(row)
    error = apply_answer(run, choice_id=choice_id, move_id=move_id.strip(), now_ms=now_ms(current))
    if error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, error)
    state = _mutate(session, row, run, None, current)
    state["ok"] = True
    return state


def continue_human(
    session: Session,
    user: User,
    session_id: uuid.UUID,
    *,
    move_id: str,
    moment: datetime | None = None,
) -> dict:
    current = moment or datetime.now(UTC)
    row = row_for_user(session, user, session_id)
    run = _run_from_row(row)
    error = apply_continue(run, move_id=move_id.strip(), now_ms=now_ms(current))
    if error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, error)
    state = _mutate(session, row, run, None, current)
    state["ok"] = True
    return state


def quit_human(
    session: Session,
    user: User,
    session_id: uuid.UUID,
    *,
    move_id: str,
    moment: datetime | None = None,
) -> dict:
    current = moment or datetime.now(UTC)
    row = row_for_user(session, user, session_id)
    run = _run_from_row(row)
    error = apply_quit(run, move_id=move_id.strip())
    if error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, error)
    state = _mutate(session, row, run, None, current)
    state["ok"] = True
    return state


def agent_state(session: Session, token: str, moment: datetime | None = None) -> dict:
    current = moment or datetime.now(UTC)
    row = row_for_agent_key(session, token)
    return present(session, row, current, grant=False)


def agent_answer(session: Session, token: str, *, choice: str, move_id: str, moment: datetime | None = None) -> dict:
    current = moment or datetime.now(UTC)
    row = row_for_agent_key(session, token)
    run = _run_from_row(row)
    choice_id, error = resolve_letter(run, choice)
    if error is None:
        error = apply_answer(run, choice_id=choice_id, move_id=move_id.strip(), now_ms=now_ms(current))
    return _mutate(session, row, run, error, current)


def agent_continue(session: Session, token: str, *, move_id: str, moment: datetime | None = None) -> dict:
    current = moment or datetime.now(UTC)
    row = row_for_agent_key(session, token)
    run = _run_from_row(row)
    error = apply_continue(run, move_id=move_id.strip(), now_ms=now_ms(current))
    return _mutate(session, row, run, error, current)


def agent_quit(session: Session, token: str, *, move_id: str, moment: datetime | None = None) -> dict:
    current = moment or datetime.now(UTC)
    row = row_for_agent_key(session, token)
    run = _run_from_row(row)
    error = apply_quit(run, move_id=move_id.strip())
    return _mutate(session, row, run, error, current)


def leaderboard(
    session: Session,
    *,
    kind: str | None = None,
    subject_id: str | None = None,
    limit: int = 30,
) -> dict:
    statement = select(SprintSession).where(SprintSession.status == "finished", SprintSession.outcome != "quit")
    if kind in {"human", "agent"}:
        statement = statement.where(SprintSession.player_kind == kind)
    if subject_id:
        statement = statement.where(SprintSession.subject_id == subject_id)
    statement = statement.order_by(
        SprintSession.score.desc(),
        SprintSession.speed_bonus.desc(),
        SprintSession.finished_at.asc(),
    ).limit(min(max(limit, 1), 50))
    rows = session.scalars(statement).all()
    entries = []
    for index, row in enumerate(rows, start=1):
        entries.append(
            {
                "rank": index,
                "displayName": row.display_name,
                "playerKind": row.player_kind,
                "score": row.score,
                "speedBonus": row.speed_bonus,
                "correct": row.correct_count,
                "questionCount": len(row.deck or []),
                "subject": row.subject_name,
                "subjectId": row.subject_id,
                "finishedAt": row.finished_at.isoformat() if row.finished_at else None,
            }
        )
    return {"ok": True, "entries": entries}


def achievement_catalog(session: Session, user: User) -> dict:
    held = _held_codes(session, str(user.id))
    catalog = []
    for code, (title, detail) in ACHIEVEMENTS.items():
        catalog.append({"code": code, "title": title, "detail": detail, "unlocked": code in held})
    return {"ok": True, "achievements": catalog}
