# ruff: noqa: B008
"""ExamSprint sessions, the public leaderboard, and the Byte Arena agent API.

Human routes use the same bearer token as the rest of ExamsPrep.
Agent routes use the apiKey returned by the single start call. That is the
contract in https://app.bytearena.fun/api/game-spec — Byte does not sign up.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse, PlainTextResponse
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import User
from app.security import bearer, require_admin, require_user
from app.sprint import bank
from app.sprint.byte_client import live_manifest, status_payload, submit_manifest
from app.sprint.service import (
    achievement_catalog,
    active_human,
    agent_answer,
    agent_continue,
    agent_quit,
    agent_state,
    answer_human,
    continue_human,
    leaderboard,
    present,
    quit_human,
    read_human,
    row_for_watch,
    start_agent,
    start_human,
)
from app.sprint.watch_page import render_watch_html

router = APIRouter(tags=["examsprint"])

WATCH_HEADERS = {
    "Content-Security-Policy": "frame-ancestors 'self' https://app.bytearena.fun",
    "Cache-Control": "no-store",
}


class StartIn(BaseModel):
    subjectId: str = "practice"


class AnswerIn(BaseModel):
    choiceId: str | None = None
    moveId: str = ""


class MoveIn(BaseModel):
    moveId: str = ""


class AgentStartIn(BaseModel):
    agentName: str = ""
    subjectId: str | None = None


class AgentAnswerIn(BaseModel):
    choice: str = ""
    moveId: str = ""


class AgentMoveIn(BaseModel):
    moveId: str = ""


def _run_id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That run does not exist.") from error


def _agent_token(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Send the apiKey from the start of the run as a Bearer token.",
        )
    return credentials.credentials


@router.get("/api/sprint/subjects")
def subjects(_user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict:
    return {"ok": True, "subjects": bank.list_subjects(session)}


@router.post("/api/sprint/sessions")
def open_session(
    body: StartIn,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
) -> dict:
    return start_human(session, user, body.subjectId.strip() or "practice")


@router.get("/api/sprint/active")
def active(user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict:
    return active_human(session, user)


@router.get("/api/sprint/sessions/{session_id}")
def read_session(
    session_id: str,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
) -> dict:
    return read_human(session, user, _run_id(session_id))


@router.post("/api/sprint/sessions/{session_id}/answer")
def answer(
    session_id: str,
    body: AnswerIn,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
) -> dict:
    choice = body.choiceId.strip() if body.choiceId else None
    return answer_human(session, user, _run_id(session_id), choice_id=choice or None, move_id=body.moveId)


@router.post("/api/sprint/sessions/{session_id}/continue")
def continue_run(
    session_id: str,
    body: MoveIn,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
) -> dict:
    return continue_human(session, user, _run_id(session_id), move_id=body.moveId)


@router.post("/api/sprint/sessions/{session_id}/quit")
def quit_run(
    session_id: str,
    body: MoveIn,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
) -> dict:
    return quit_human(session, user, _run_id(session_id), move_id=body.moveId)


@router.get("/api/sprint/leaderboard")
def sprint_leaderboard(
    kind: str | None = None,
    subjectId: str | None = None,
    session: Session = Depends(get_session),
) -> dict:
    return leaderboard(session, kind=kind, subject_id=subjectId)


@router.get("/api/sprint/achievements")
def achievements(user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict:
    return achievement_catalog(session, user)


@router.post("/api/sprint/agent/start")
def agent_start(body: AgentStartIn, session: Session = Depends(get_session)) -> dict:
    return start_agent(session, body.agentName, body.subjectId)


@router.get("/api/sprint/agent/state")
def agent_read(token: str = Depends(_agent_token), session: Session = Depends(get_session)) -> dict:
    return agent_state(session, token)


@router.post("/api/sprint/agent/answer")
def agent_play(
    body: AgentAnswerIn,
    token: str = Depends(_agent_token),
    session: Session = Depends(get_session),
) -> dict:
    return agent_answer(session, token, choice=body.choice, move_id=body.moveId)


@router.post("/api/sprint/agent/continue")
def agent_next(
    body: AgentMoveIn,
    token: str = Depends(_agent_token),
    session: Session = Depends(get_session),
) -> dict:
    return agent_continue(session, token, move_id=body.moveId)


@router.post("/api/sprint/agent/quit")
def agent_stop(
    body: AgentMoveIn,
    token: str = Depends(_agent_token),
    session: Session = Depends(get_session),
) -> dict:
    return agent_quit(session, token, move_id=body.moveId)


@router.get("/api/sprint/watch/{session_id}")
def watch_state(session_id: str, session: Session = Depends(get_session)) -> dict:
    row = row_for_watch(session, _run_id(session_id))
    return present(session, row, datetime.now(UTC), grant=False)


@router.get("/sprint/watch/{session_id}", response_class=HTMLResponse)
def watch_page(session_id: str) -> HTMLResponse:
    _run_id(session_id)
    return HTMLResponse(render_watch_html(session_id), headers=WATCH_HEADERS)


@router.get("/api/sprint/byte/status")
def byte_status() -> dict:
    return status_payload()


@router.get("/api/sprint/byte/manifest", response_class=PlainTextResponse)
def byte_manifest() -> PlainTextResponse:
    return PlainTextResponse(live_manifest(), media_type="text/markdown; charset=utf-8")


@router.post("/api/sprint/byte/preview")
def byte_preview(_admin: User = Depends(require_admin)) -> dict:
    return submit_manifest(save=False)


@router.post("/api/sprint/byte/register")
def byte_register(_admin: User = Depends(require_admin)) -> dict:
    return submit_manifest(save=True)
