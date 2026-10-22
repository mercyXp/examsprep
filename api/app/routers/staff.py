from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.access import AccessScope, staff_scope, write_audit
from app.db import get_session
from app.models.audit import AuditLog
from app.models.identity import Role, User, UserRole
from app.models.staff import StaffInvitation
from app.routers.auth import _auth_out
from app.security import role_slugs
from app.emailer import send_staff_access_notice, send_staff_role_notice
from app.staff_invites import (
    ROLE_LABELS,
    StaffInviteError,
    accept_invitation,
    acceptance_url,
    change_staff_role,
    create_invitation,
    find_invitation,
    invitation_state,
    resend_invitation,
    revoke_invitation,
    send_invitation_email,
    set_staff_access,
)

router = APIRouter(tags=["staff"])
SCOPE = Depends(staff_scope)


class InviteIn(BaseModel):
    email: str
    role: str


class AcceptIn(BaseModel):
    name: str
    password: str


class RoleChangeIn(BaseModel):
    role: str


class AccessIn(BaseModel):
    active: bool


def _raise(error: StaffInviteError) -> None:
    raise HTTPException(status_code=error.status_code, detail=error.message) from error


def _require_super(scope: AccessScope) -> None:
    if not scope.super_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a super administrator can manage staff.")


def _invitation_out(row: StaffInvitation) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "email": row.email,
        "role": row.role_slug,
        "roleLabel": ROLE_LABELS.get(row.role_slug, row.role_slug),
        "status": invitation_state(row),
        "expiresAt": row.expires_at.isoformat(),
        "createdAt": row.created_at.isoformat() if row.created_at else None,
        "acceptedAt": row.accepted_at.isoformat() if row.accepted_at else None,
    }


def _deliver(row: StaffInvitation, raw: str) -> dict[str, Any]:
    emailed = send_invitation_email(row.email, row.role_slug, raw)
    return {
        "invitation": _invitation_out(row),
        "emailed": emailed,
        "acceptUrl": None if emailed else acceptance_url(raw),
    }


@router.get("/api/admin/staff")
def staff_directory(scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    _require_super(scope)
    users = session.scalars(
        select(User)
        .options(joinedload(User.roles).joinedload(UserRole.role))
        .join(UserRole)
        .join(Role)
        .where(Role.slug.in_(["creator", "administrator"]))
        .order_by(User.name)
    ).unique()
    people = []
    seen: set[uuid.UUID] = set()
    for user in users:
        if user.id in seen:
            continue
        seen.add(user.id)
        slugs = [slug for slug in role_slugs(user) if slug in {"creator", "administrator"}]
        people.append(
            {
                "id": str(user.id),
                "name": user.name,
                "email": user.email,
                "roles": slugs,
                "status": user.status.value,
            }
        )
    invitations = [
        _invitation_out(row)
        for row in session.scalars(select(StaffInvitation).order_by(StaffInvitation.created_at.desc())).all()
    ]
    history = []
    logs = session.scalars(
        select(AuditLog)
        .options(joinedload(AuditLog.actor))
        .where(AuditLog.action.like("staff.%"))
        .order_by(AuditLog.created_at.desc())
        .limit(30)
    ).unique()
    for entry in logs:
        history.append(
            {
                "id": str(entry.id),
                "action": entry.action,
                "at": entry.created_at.isoformat() if entry.created_at else None,
                "actor": entry.actor.name if entry.actor else "",
                "email": (entry.payload or {}).get("email", ""),
                "role": (entry.payload or {}).get("role", ""),
            }
        )
    return {"ok": True, "people": people, "invitations": invitations, "history": history}


@router.post("/api/admin/staff/invitations")
def invite_staff(body: InviteIn, scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    _require_super(scope)
    try:
        row, raw = create_invitation(session, email=body.email, role_slug=body.role, invited_by_id=scope.user.id)
    except StaffInviteError as error:
        _raise(error)
    write_audit(
        session,
        scope.user,
        "staff.invite",
        "staff_invitation",
        row.id,
        {"email": row.email, "role": row.role_slug},
    )
    return {"ok": True, **_deliver(row, raw)}


@router.post("/api/admin/staff/invitations/{invitation_id}/resend")
def resend_staff_invite(
    invitation_id: uuid.UUID,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    _require_super(scope)
    try:
        row, raw = resend_invitation(session, invitation_id)
    except StaffInviteError as error:
        _raise(error)
    write_audit(
        session,
        scope.user,
        "staff.invite.resend",
        "staff_invitation",
        row.id,
        {"email": row.email, "role": row.role_slug},
    )
    return {"ok": True, **_deliver(row, raw)}


@router.post("/api/admin/staff/invitations/{invitation_id}/revoke")
def revoke_staff_invite(
    invitation_id: uuid.UUID,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    _require_super(scope)
    try:
        row = revoke_invitation(session, invitation_id)
    except StaffInviteError as error:
        _raise(error)
    write_audit(
        session,
        scope.user,
        "staff.invite.revoke",
        "staff_invitation",
        row.id,
        {"email": row.email, "role": row.role_slug},
    )
    return {"ok": True, "invitation": _invitation_out(row)}


@router.patch("/api/admin/staff/{user_id}/role")
def update_staff_role(
    user_id: uuid.UUID,
    body: RoleChangeIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    _require_super(scope)
    try:
        user = change_staff_role(session, user_id, body.role)
    except StaffInviteError as error:
        _raise(error)
    write_audit(
        session,
        scope.user,
        "staff.role.change",
        "user",
        user.id,
        {"email": user.email, "role": body.role},
    )
    send_staff_role_notice(user.email, ROLE_LABELS.get(body.role, body.role))
    return {"ok": True, "id": str(user.id), "roles": role_slugs(user)}


@router.post("/api/admin/staff/{user_id}/access")
def update_staff_access(
    user_id: uuid.UUID,
    body: AccessIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    _require_super(scope)
    try:
        user = set_staff_access(session, user_id, body.active)
    except StaffInviteError as error:
        _raise(error)
    write_audit(
        session,
        scope.user,
        "staff.access.restore" if body.active else "staff.access.revoke",
        "user",
        user.id,
        {"email": user.email},
    )
    send_staff_access_notice(user.email, body.active)
    return {"ok": True, "id": str(user.id), "status": user.status.value}


@router.get("/api/auth/invitations/{token}")
def preview_invitation(token: str, session: Session = Depends(get_session)) -> dict[str, Any]:
    try:
        row = find_invitation(session, token)
    except StaffInviteError as error:
        _raise(error)
    state = invitation_state(row)
    return {
        "ok": True,
        "email": row.email,
        "role": row.role_slug,
        "roleLabel": ROLE_LABELS.get(row.role_slug, row.role_slug),
        "status": state,
    }


@router.post("/api/auth/invitations/{token}")
def activate_invitation(token: str, body: AcceptIn, session: Session = Depends(get_session)):
    try:
        user = accept_invitation(session, token, body.name, body.password)
    except StaffInviteError as error:
        _raise(error)
    write_audit(
        session,
        user,
        "staff.invite.accept",
        "user",
        user.id,
        {"email": user.email, "role": next((slug for slug in role_slugs(user) if slug != "student"), "")},
    )
    return _auth_out(user)
