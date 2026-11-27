"""Turn lesson and quiz rows into badge claims and prize-pool payouts.

The route handlers stay thin. This module loads the existing learning tables,
asks eligibility.py what was earned, then asks the chain client to write it.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from solders.pubkey import Pubkey
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.access import AccessScope, write_audit
from app.config import settings
from app.models import Lesson, LessonProgress, Module, Quiz, QuizAttempt, User
from app.models.catalogue import AcademicYear, Semester
from app.models.enums import ContentStatus, QuizKind
from app.models.solana import BadgeAward, PrizePayout, PrizePool, WalletLink
from app.security import role_slugs
from app.solana.chain import (
    ChainDisabled,
    ChainError,
    ChainReceipt,
    RecordingChain,
    SolanaChain,
    badge_pda,
    subject_hash,
)
from app.solana.eligibility import (
    KIND_BYTE,
    KIND_WEEKLY,
    SELF_SERVE_KINDS,
    Eligibility,
    MockPass,
    PublishedLesson,
    ScoreRow,
    mastered_topics,
    passed_mocks,
    rank_students,
    split_prize,
    streak_eligibility,
)
from app.solana.gates import assert_pool_admin
from app.solana.wallet import WalletLinkError, link_message, verify_link_signature

CHALLENGE_MINUTES = 10


def _chain_call(action):
    try:
        return action()
    except ChainDisabled as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, exc.message) from exc
    except ChainError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, exc.message) from exc


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _display_name(user: User) -> str:
    name = (user.name or "").strip()
    return name.split()[0] if name else "Student"


def _subject_for_module(module: Module) -> tuple[str, str]:
    programme = None
    semester = module.semester
    year = semester.academic_year if semester is not None else None
    if year is not None:
        programme = year.programme
    slug = programme.slug if programme is not None else "programme"
    return f"{slug}:{module.code}", f"{module.code} {module.name}"


def _module_in_programme(module: Module, programme_id: uuid.UUID | None) -> bool:
    if programme_id is None:
        return True
    semester = module.semester
    year = semester.academic_year if semester is not None else None
    return year is not None and year.programme_id == programme_id


def published_lessons(session: Session) -> list[tuple[PublishedLesson, Module]]:
    lessons = list(
        session.scalars(
            select(Lesson)
            .options(
                joinedload(Lesson.module)
                .joinedload(Module.semester)
                .joinedload(Semester.academic_year)
                .joinedload(AcademicYear.programme)
            )
            .where(Lesson.status == ContentStatus.PUBLISHED, Lesson.published_version_id.is_not(None))
        ).unique()
    )
    rows: list[tuple[PublishedLesson, Module]] = []
    for lesson in lessons:
        if lesson.module is None:
            continue
        key, label = _subject_for_module(lesson.module)
        rows.append((PublishedLesson(key, label, str(lesson.id)), lesson.module))
    return rows


def completed_lesson_ids(session: Session, user_id: uuid.UUID) -> set[str]:
    rows = session.scalars(
        select(LessonProgress).where(
            LessonProgress.user_id == user_id,
            LessonProgress.completed_at.is_not(None),
        )
    )
    return {str(row.lesson_id) for row in rows}


def study_days_for(session: Session, user_id: uuid.UUID) -> set:
    days = set()
    progress = session.scalars(
        select(LessonProgress).where(
            LessonProgress.user_id == user_id,
            LessonProgress.completed_at.is_not(None),
        )
    )
    for row in progress:
        if row.completed_at is not None:
            days.add(_aware(row.completed_at).date())
    attempts = session.scalars(
        select(QuizAttempt).where(
            QuizAttempt.user_id == user_id,
            QuizAttempt.submitted_at.is_not(None),
        )
    )
    for attempt in attempts:
        if attempt.submitted_at is not None:
            days.add(_aware(attempt.submitted_at).date())
    return days


def mock_passes_for(session: Session, user_id: uuid.UUID) -> list[MockPass]:
    attempts = list(
        session.scalars(
            select(QuizAttempt)
            .options(joinedload(QuizAttempt.quiz))
            .where(
                QuizAttempt.user_id == user_id,
                QuizAttempt.passed.is_(True),
                QuizAttempt.submitted_at.is_not(None),
            )
        ).unique()
    )
    passes: list[MockPass] = []
    for attempt in attempts:
        quiz = attempt.quiz
        if quiz is None or quiz.kind != QuizKind.MOCK:
            continue
        score = int(attempt.score_percent or 0)
        passes.append(MockPass(str(quiz.id), quiz.title, score))
    return passes


def eligibility_for(session: Session, user: User, today=None) -> list[Eligibility]:
    today = today or datetime.now(UTC).date()
    lessons = [item for item, _module in published_lessons(session)]
    found = mastered_topics(lessons, completed_lesson_ids(session, user.id))
    found.extend(passed_mocks(mock_passes_for(session, user.id)))
    streak = streak_eligibility(study_days_for(session, user.id), today)
    if streak is not None:
        found.append(streak)
    return found


def awarded_keys(session: Session, user_id: uuid.UUID) -> set[tuple[str, str]]:
    rows = session.scalars(select(BadgeAward).where(BadgeAward.user_id == user_id))
    return {(row.kind, row.subject_key) for row in rows}


def linked_wallet(session: Session, user_id: uuid.UUID) -> WalletLink | None:
    row = session.get(WalletLink, user_id)
    if row is None or row.linked_at is None or not row.address:
        return None
    return row


def wallet_by_address(session: Session, address: str) -> WalletLink | None:
    return session.scalar(select(WalletLink).where(WalletLink.address == address, WalletLink.linked_at.is_not(None)))


def start_challenge(session: Session, user: User) -> dict[str, Any]:
    nonce = secrets.token_urlsafe(24)
    expires = datetime.now(UTC) + timedelta(minutes=CHALLENGE_MINUTES)
    row = session.get(WalletLink, user.id)
    if row is None:
        row = WalletLink(user_id=user.id)
        session.add(row)
    row.challenge_nonce = nonce
    row.challenge_expires_at = expires
    session.flush()
    message = link_message(user.id, nonce)
    return {"ok": True, "challenge": message, "expiresAt": expires.isoformat()}


def link_wallet(session: Session, user: User, address: str, signature: str) -> dict[str, Any]:
    row = session.get(WalletLink, user.id)
    if row is None or not row.challenge_nonce or row.challenge_expires_at is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ask for a new wallet challenge, then sign that message.")
    if _aware(row.challenge_expires_at) < datetime.now(UTC):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That wallet challenge expired. Ask for a new one.")
    try:
        canonical = verify_link_signature(address, link_message(user.id, row.challenge_nonce), signature)
    except WalletLinkError as exc:
        raise HTTPException(exc.status_code, exc.message) from exc
    taken = session.scalar(
        select(WalletLink).where(WalletLink.address == canonical, WalletLink.user_id != user.id)
    )
    if taken is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "That wallet is already linked to another account.")
    row.address = canonical
    row.linked_at = datetime.now(UTC)
    row.challenge_nonce = None
    row.challenge_expires_at = None
    write_audit(session, user, "wallet.linked", "wallet", user.id, {"address": canonical})
    session.flush()
    return {"ok": True, "address": canonical, "linkedAt": row.linked_at.isoformat()}


def unlink_wallet(session: Session, user: User) -> dict[str, Any]:
    row = session.get(WalletLink, user.id)
    if row is not None:
        session.delete(row)
        write_audit(session, user, "wallet.unlinked", "wallet", user.id, {})
        session.flush()
    return {"ok": True}


def wallet_out(session: Session, user: User) -> dict[str, Any]:
    row = linked_wallet(session, user.id)
    return {"ok": True, "linked": row is not None, "address": row.address if row else None}


def _save_award(
    session: Session,
    user: User,
    wallet: str,
    item: Eligibility,
    receipt: ChainReceipt,
) -> BadgeAward:
    existing = session.scalar(
        select(BadgeAward).where(
            BadgeAward.user_id == user.id,
            BadgeAward.kind == item.kind,
            BadgeAward.subject_key == item.subject_key,
        )
    )
    if existing is not None:
        if not existing.tx_signature and receipt.signature:
            existing.tx_signature = receipt.signature
        return existing
    award = BadgeAward(
        user_id=user.id,
        wallet_address=wallet,
        kind=item.kind,
        subject_key=item.subject_key,
        subject_label=item.subject_label,
        detail=item.detail,
        tx_signature=receipt.signature or None,
    )
    session.add(award)
    session.flush()
    session.refresh(award)
    write_audit(
        session,
        user,
        "badge.awarded",
        "badge",
        award.id,
        {"kind": item.kind, "subject": item.subject_key, "tx": receipt.signature},
    )
    return award


def claim_badge(
    session: Session,
    user: User,
    kind: str,
    subject_key: str,
    chain: RecordingChain | SolanaChain,
) -> dict[str, Any]:
    if "student" not in role_slugs(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Badges are claimed by students.")
    if kind not in SELF_SERVE_KINDS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Weekly leaderboard badges are awarded when an administrator settles the prize pool.",
        )
    wallet = linked_wallet(session, user.id)
    if wallet is None or not wallet.address:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Link a Solana wallet before claiming a badge.")
    match = next(
        (
            item
            for item in eligibility_for(session, user)
            if item.kind == kind and item.subject_key == subject_key
        ),
        None,
    )
    if match is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "You have not earned that badge yet.")
    if (kind, subject_key) in awarded_keys(session, user.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "That badge is already on your account.")
    receipt = _chain_call(
        lambda: chain.award_badge(wallet.address or "", KIND_BYTE[kind], subject_key, match.detail)
    )
    award = _save_award(session, user, wallet.address, match, receipt)
    return {"ok": True, "badge": badge_out(award)}


def badge_out(award: BadgeAward) -> dict[str, Any]:
    program_id = Pubkey.from_string(settings.solana_program_id)
    student = Pubkey.from_string(award.wallet_address)
    pda = badge_pda(program_id, student, KIND_BYTE[award.kind], subject_hash(award.subject_key))
    return {
        "id": str(award.id),
        "kind": award.kind,
        "subjectKey": award.subject_key,
        "label": award.subject_label,
        "detail": award.detail,
        "tx": award.tx_signature,
        "pda": str(pda),
        "awardedAt": award.created_at.isoformat() if award.created_at else None,
    }


def my_badges(session: Session, user: User) -> dict[str, Any]:
    rows = list(session.scalars(select(BadgeAward).where(BadgeAward.user_id == user.id).order_by(BadgeAward.created_at)))
    held = {(row.kind, row.subject_key) for row in rows}
    claimable = [
        {
            "kind": item.kind,
            "subjectKey": item.subject_key,
            "label": item.subject_label,
            "detail": item.detail,
            "reason": item.reason,
        }
        for item in eligibility_for(session, user)
        if (item.kind, item.subject_key) not in held
    ]
    return {"ok": True, "badges": [badge_out(row) for row in rows], "claimable": claimable}


def public_badges(session: Session, address: str) -> dict[str, Any]:
    try:
        canonical = str(Pubkey.from_string(address.strip()))
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That does not look like a Solana wallet address.") from exc
    rows = list(
        session.scalars(select(BadgeAward).where(BadgeAward.wallet_address == canonical).order_by(BadgeAward.created_at))
    )
    link = wallet_by_address(session, canonical)
    display = _display_name(link.user) if link is not None and link.user is not None else None
    return {
        "ok": True,
        "wallet": canonical,
        "displayName": display,
        "programId": settings.solana_program_id,
        "badges": [badge_out(row) for row in rows],
    }


def leaderboard_rows(
    session: Session,
    period_start: datetime,
    period_end: datetime,
    programme_id: uuid.UUID | None,
) -> list[ScoreRow]:
    start = _aware(period_start)
    end = _aware(period_end)
    totals: dict[uuid.UUID, dict[str, Any]] = {}

    attempts = list(
        session.scalars(
            select(QuizAttempt)
            .options(
                joinedload(QuizAttempt.user),
                joinedload(QuizAttempt.quiz)
                .joinedload(Quiz.module)
                .joinedload(Module.semester)
                .joinedload(Semester.academic_year),
            )
            .where(QuizAttempt.submitted_at.is_not(None))
        ).unique()
    )
    best: dict[tuple[uuid.UUID, uuid.UUID], tuple[int, datetime]] = {}
    for attempt in attempts:
        if attempt.submitted_at is None or attempt.quiz is None or attempt.quiz.module is None:
            continue
        submitted = _aware(attempt.submitted_at)
        if submitted < start or submitted >= end:
            continue
        if not _module_in_programme(attempt.quiz.module, programme_id):
            continue
        score = int(attempt.score_percent or 0)
        key = (attempt.user_id, attempt.quiz_id)
        current = best.get(key)
        if current is None or score > current[0]:
            best[key] = (score, submitted)
        bucket = totals.setdefault(
            attempt.user_id,
            {"user": attempt.user, "quiz": 0, "lessons": 0, "latest": submitted},
        )
        bucket["latest"] = max(bucket["latest"], submitted)
    for (user_id, _quiz_id), (score, submitted) in best.items():
        bucket = totals[user_id]
        bucket["quiz"] += score
        bucket["latest"] = max(bucket["latest"], submitted)

    progress_rows = list(
        session.scalars(
            select(LessonProgress)
            .options(
                joinedload(LessonProgress.user),
                joinedload(LessonProgress.lesson)
                .joinedload(Lesson.module)
                .joinedload(Module.semester)
                .joinedload(Semester.academic_year),
            )
            .where(LessonProgress.completed_at.is_not(None))
        ).unique()
    )
    for row in progress_rows:
        if row.completed_at is None or row.lesson is None or row.lesson.module is None:
            continue
        completed = _aware(row.completed_at)
        if completed < start or completed >= end:
            continue
        if not _module_in_programme(row.lesson.module, programme_id):
            continue
        bucket = totals.setdefault(
            row.user_id,
            {"user": row.user, "quiz": 0, "lessons": 0, "latest": completed},
        )
        bucket["lessons"] += 1
        bucket["latest"] = max(bucket["latest"], completed)

    rows = [
        ScoreRow(
            user_id=str(user_id),
            display_name=_display_name(bucket["user"]) if bucket.get("user") is not None else "Student",
            quiz_points=int(bucket["quiz"]),
            lessons_completed=int(bucket["lessons"]),
            latest_activity=bucket["latest"],
        )
        for user_id, bucket in totals.items()
    ]
    return rank_students(rows)


def leaderboard_out(
    session: Session,
    period_start: datetime,
    period_end: datetime,
    programme_id: uuid.UUID | None,
    limit: int,
) -> dict[str, Any]:
    ranked = leaderboard_rows(session, period_start, period_end, programme_id)[:limit]
    return {
        "ok": True,
        "periodStart": _aware(period_start).isoformat(),
        "periodEnd": _aware(period_end).isoformat(),
        "items": [
            {
                "rank": index + 1,
                "displayName": row.display_name,
                "quizPoints": row.quiz_points,
                "lessonsCompleted": row.lessons_completed,
            }
            for index, row in enumerate(ranked)
        ],
    }


def _new_pool_id(session: Session) -> int:
    for _ in range(5):
        candidate = secrets.randbits(62)
        taken = session.scalar(select(PrizePool).where(PrizePool.onchain_pool_id == candidate))
        if taken is None:
            return candidate
    raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Could not allocate a prize pool id. Try again.")


def create_pool(
    session: Session,
    scope: AccessScope,
    *,
    title: str,
    programme_id: uuid.UUID | None,
    period_start: datetime,
    period_end: datetime,
    top_n: int,
    mint: str,
    chain: RecordingChain | SolanaChain,
) -> PrizePool:
    assert_pool_admin(scope, programme_id)
    if _aware(period_end) <= _aware(period_start):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The prize period must end after it starts.")
    if not 1 <= top_n <= 10:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Top N must be between 1 and 10.")
    if not title.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Give the prize pool a title.")
    pool_id = _new_pool_id(session)
    receipt = _chain_call(
        lambda: chain.create_pool(
            pool_id,
            int(_aware(period_start).timestamp()),
            int(_aware(period_end).timestamp()),
            top_n,
            mint,
        )
    )
    pool = PrizePool(
        programme_id=programme_id,
        created_by_id=scope.user.id,
        title=title.strip(),
        period_start=_aware(period_start),
        period_end=_aware(period_end),
        top_n=top_n,
        mint=mint,
        onchain_pool_id=pool_id,
        pool_address=receipt.pool_address,
        vault_address=receipt.vault_address,
        status="open",
        create_tx=receipt.signature or None,
    )
    session.add(pool)
    write_audit(session, scope.user, "pool.created", "prize_pool", pool.id, {"poolId": pool_id, "title": pool.title})
    session.flush()
    return pool


def fund_pool(
    session: Session,
    scope: AccessScope,
    pool: PrizePool,
    amount: int,
    chain: RecordingChain | SolanaChain,
) -> PrizePool:
    assert_pool_admin(scope, pool.programme_id)
    if pool.status == "settled":
        raise HTTPException(status.HTTP_409_CONFLICT, "This prize pool has already been paid.")
    if amount <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter an amount greater than zero.")
    receipt = _chain_call(lambda: chain.fund_pool(pool.onchain_pool_id, amount, pool.mint))
    pool.total_amount = int(pool.total_amount or 0) + amount
    pool.status = "funded"
    pool.fund_tx = receipt.signature or pool.fund_tx
    if isinstance(chain, SolanaChain) and chain.sponsor is not None:
        pool.sponsor_wallet = str(chain.sponsor.pubkey())
    write_audit(
        session,
        scope.user,
        "pool.funded",
        "prize_pool",
        pool.id,
        {"amount": amount, "tx": receipt.signature},
    )
    session.flush()
    return pool


def settle_pool(
    session: Session,
    scope: AccessScope,
    pool: PrizePool,
    chain: RecordingChain | SolanaChain,
) -> PrizePool:
    assert_pool_admin(scope, pool.programme_id)
    if pool.status == "settled":
        raise HTTPException(status.HTTP_409_CONFLICT, "This prize pool has already been paid.")
    ranked = leaderboard_rows(session, pool.period_start, pool.period_end, pool.programme_id)[: pool.top_n]
    if not ranked:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nobody studied during this prize period, so there is nobody to pay.")

    payable: list[tuple[ScoreRow, str, int]] = []
    skipped: list[tuple[ScoreRow, int]] = []
    for index, row in enumerate(ranked, start=1):
        user = session.get(User, uuid.UUID(row.user_id))
        wallet = linked_wallet(session, user.id) if user is not None else None
        if user is None or wallet is None or not wallet.address:
            skipped.append((row, index))
            continue
        payable.append((row, wallet.address, index))

    amounts = split_prize(int(pool.total_amount or 0), len(payable))
    pay_rows = payable[: len(amounts)]
    signature = ""
    if pay_rows and amounts and int(pool.total_amount or 0) > 0:
        signature = _chain_call(
            lambda: chain.pay_winners(
                pool.onchain_pool_id,
                pool.mint,
                [address for _row, address, _rank in pay_rows],
                amounts,
            )
        ).signature
    elif int(pool.total_amount or 0) > 0 and not pay_rows:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "The top students have not linked a wallet, so the pool cannot be paid yet.",
        )

    for (row, address, rank), amount in zip(pay_rows, amounts, strict=False):
        user = session.get(User, uuid.UUID(row.user_id))
        if user is None:
            continue
        item = Eligibility(
            kind=KIND_WEEKLY,
            subject_key=f"pool:{pool.onchain_pool_id}",
            subject_label=f"{pool.title} · rank {rank}",
            detail=rank,
            reason=f"Finished rank {rank}.",
        )
        receipt = _chain_call(lambda user=user, address=address, item=item: chain.award_badge(
            address, KIND_BYTE[KIND_WEEKLY], item.subject_key, item.detail
        ))
        _save_award(session, user, address, item, receipt)
        session.add(
            PrizePayout(
                pool_id=pool.id,
                user_id=user.id,
                rank=rank,
                amount=amount,
                wallet_address=address,
                tx_signature=signature or None,
                note="paid",
            )
        )
    for row, rank in skipped:
        user = session.get(User, uuid.UUID(row.user_id))
        if user is None:
            continue
        session.add(
            PrizePayout(
                pool_id=pool.id,
                user_id=user.id,
                rank=rank,
                amount=0,
                wallet_address=None,
                note="No linked wallet, so this rank was not paid on-chain.",
            )
        )
    pool.status = "settled"
    pool.settle_tx = signature or None
    write_audit(session, scope.user, "pool.settled", "prize_pool", pool.id, {"tx": signature})
    session.flush()
    return pool


def pool_out(pool: PrizePool) -> dict[str, Any]:
    payouts = [
        {
            "rank": item.rank,
            "displayName": _display_name(item.user) if item.user is not None else "Student",
            "amount": int(item.amount or 0),
            "wallet": item.wallet_address,
            "note": item.note,
        }
        for item in sorted(pool.payouts or [], key=lambda item: item.rank)
    ]
    return {
        "id": str(pool.id),
        "title": pool.title,
        "programmeId": str(pool.programme_id) if pool.programme_id else None,
        "periodStart": pool.period_start.isoformat(),
        "periodEnd": pool.period_end.isoformat(),
        "topN": pool.top_n,
        "mint": pool.mint,
        "status": pool.status,
        "totalAmount": int(pool.total_amount or 0),
        "poolAddress": pool.pool_address,
        "vaultAddress": pool.vault_address,
        "onchainPoolId": pool.onchain_pool_id,
        "payouts": payouts,
    }
