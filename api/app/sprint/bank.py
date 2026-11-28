"""Published multiple-choice cards, plus a practice deck when a module has none."""

from __future__ import annotations

import random
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.catalogue import Module
from app.models.content import Question, QuestionVersion
from app.models.enums import ContentStatus
from app.quizzes import correct_id_set, normalize_choices
from app.sprint.engine import DECK_SIZE

PRACTICE_ID = "practice"

# Original practice prompts so a demo can start before a module is published.
PRACTICE_DECK: list[dict] = [
    {
        "id": "p1",
        "prompt": "In a relational database, what must a primary key be?",
        "choices": [
            {"id": "0", "label": "Unique for each row"},
            {"id": "1", "label": "Always a person's name"},
            {"id": "2", "label": "Stored only in the application"},
            {"id": "3", "label": "Allowed to repeat on every row"},
        ],
        "correctIds": ["0"],
        "explanation": "A primary key identifies one row, so its value cannot repeat.",
    },
    {
        "id": "p2",
        "prompt": "Which HTTP method reads a resource and is not meant to change it?",
        "choices": [
            {"id": "0", "label": "POST"},
            {"id": "1", "label": "GET"},
            {"id": "2", "label": "DELETE"},
            {"id": "3", "label": "PATCH"},
        ],
        "correctIds": ["1"],
        "explanation": "GET retrieves a representation. It should not be the call that writes data.",
    },
    {
        "id": "p3",
        "prompt": "What is the time complexity of binary search on a sorted array?",
        "choices": [
            {"id": "0", "label": "O(n²)"},
            {"id": "1", "label": "O(n)"},
            {"id": "2", "label": "O(log n)"},
            {"id": "3", "label": "O(1) always"},
        ],
        "correctIds": ["2"],
        "explanation": "Each comparison throws away half of the remaining sorted range.",
    },
    {
        "id": "p4",
        "prompt": "In the ACID properties of a transaction, what does I stand for?",
        "choices": [
            {"id": "0", "label": "Indexing"},
            {"id": "1", "label": "Isolation"},
            {"id": "2", "label": "Iteration"},
            {"id": "3", "label": "Inheritance"},
        ],
        "correctIds": ["1"],
        "explanation": "Isolation keeps concurrent transactions from seeing each other's half-finished work.",
    },
    {
        "id": "p5",
        "prompt": "Which OSI layer is responsible for routing packets between networks?",
        "choices": [
            {"id": "0", "label": "Physical"},
            {"id": "1", "label": "Data link"},
            {"id": "2", "label": "Network"},
            {"id": "3", "label": "Session"},
        ],
        "correctIds": ["2"],
        "explanation": "The network layer addresses and forwards packets across networks.",
    },
    {
        "id": "p6",
        "prompt": "What does a foreign key do?",
        "choices": [
            {"id": "0", "label": "Encrypts a column"},
            {"id": "1", "label": "References a key in another table"},
            {"id": "2", "label": "Deletes the database"},
            {"id": "3", "label": "Replaces the primary key of every table"},
        ],
        "correctIds": ["1"],
        "explanation": "A foreign key points at a row in another table and keeps that link valid.",
    },
    {
        "id": "p7",
        "prompt": "Which Git command records the current snapshot in the local repository?",
        "choices": [
            {"id": "0", "label": "git push"},
            {"id": "1", "label": "git clone"},
            {"id": "2", "label": "git commit"},
            {"id": "3", "label": "git fetch"},
        ],
        "correctIds": ["2"],
        "explanation": "Commit stores a snapshot locally. Push sends commits that already exist.",
    },
    {
        "id": "p8",
        "prompt": "Which data structure removes items in the same order they arrived (FIFO)?",
        "choices": [
            {"id": "0", "label": "Stack"},
            {"id": "1", "label": "Queue"},
            {"id": "2", "label": "Hash set"},
            {"id": "3", "label": "Binary heap used as a priority queue"},
        ],
        "correctIds": ["1"],
        "explanation": "A queue dequeues the oldest item first. A stack does the opposite.",
    },
    {
        "id": "p9",
        "prompt": "Which description fits TCP?",
        "choices": [
            {"id": "0", "label": "Connectionless, no delivery guarantee"},
            {"id": "1", "label": "A file format for images"},
            {"id": "2", "label": "Connection-oriented and reliable"},
            {"id": "3", "label": "A CPU scheduling algorithm"},
        ],
        "correctIds": ["2"],
        "explanation": "TCP sets up a connection and retransmits so the byte stream arrives in order.",
    },
]


def card_from_parts(
    *,
    card_id: str,
    prompt: str,
    raw_choices: object,
    raw_correct: object,
    explanation: str,
) -> dict | None:
    """One single-answer card an agent can answer with A–D, or None if it cannot."""
    choices = list(normalize_choices(raw_choices))[:4]
    correct = correct_id_set(raw_correct)
    if len(correct) != 1 or len(choices) < 2 or not prompt.strip():
        return None
    if not correct.issubset({choice.id for choice in choices}):
        return None
    correct_id = next(iter(correct))
    return {
        "id": card_id,
        "prompt": prompt.strip(),
        "choices": [{"id": choice.id, "label": choice.label} for choice in choices],
        "correctIds": [correct_id],
        "explanation": (explanation or "").strip(),
    }


def _published_rows(session: Session) -> list[tuple[Question, QuestionVersion]]:
    statement = (
        select(Question, QuestionVersion)
        .join(QuestionVersion, Question.published_version_id == QuestionVersion.id)
        .where(Question.status == ContentStatus.PUBLISHED)
        .where(Question.kind == "mcq")
    )
    return list(session.execute(statement).all())


def list_subjects(session: Session) -> list[dict]:
    grouped: dict[uuid.UUID, int] = {}
    for question, version in _published_rows(session):
        card = card_from_parts(
            card_id=str(version.id),
            prompt=version.prompt,
            raw_choices=version.choices,
            raw_correct=version.correct_option_ids,
            explanation=version.explanation,
        )
        if card is not None:
            grouped[question.module_id] = grouped.get(question.module_id, 0) + 1

    subjects = [
        {
            "id": PRACTICE_ID,
            "name": "Practice sprint",
            "code": "SPRINT",
            "questionCount": len(PRACTICE_DECK),
            "available": len(PRACTICE_DECK),
            "source": "practice",
            "blurb": "A built-in deck you can play before a module has published questions.",
        }
    ]
    if not grouped:
        return subjects
    modules = session.scalars(select(Module).where(Module.id.in_(grouped.keys())).order_by(Module.code)).all()
    for module in modules:
        available = grouped.get(module.id, 0)
        if available < 1:
            continue
        blurb = (module.description or "").strip()
        subjects.append(
            {
                "id": str(module.id),
                "name": module.name,
                "code": module.code,
                "questionCount": min(DECK_SIZE, available),
                "available": available,
                "source": "bank",
                "blurb": blurb[:180],
            }
        )
    return subjects


def deal(session: Session, subject_id: str) -> tuple[str, str, str, list[dict]]:
    """Return subject id, name, source, and a deck of at most nine cards."""
    if subject_id == PRACTICE_ID:
        deck = [dict(card, choices=[dict(choice) for choice in card["choices"]]) for card in PRACTICE_DECK]
        random.shuffle(deck)
        return PRACTICE_ID, "Practice sprint", "practice", deck

    try:
        module_id = uuid.UUID(subject_id)
    except ValueError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That subject is not available.") from error

    module = session.get(Module, module_id)
    if module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That subject is not in the catalogue.")

    cards: list[dict] = []
    for question, version in _published_rows(session):
        if question.module_id != module_id:
            continue
        card = card_from_parts(
            card_id=str(version.id),
            prompt=version.prompt,
            raw_choices=version.choices,
            raw_correct=version.correct_option_ids,
            explanation=version.explanation,
        )
        if card is not None:
            cards.append(card)
    if not cards:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "That subject has no published multiple-choice questions yet. Try Practice sprint.",
        )
    if len(cards) > DECK_SIZE:
        cards = random.sample(cards, DECK_SIZE)
    random.shuffle(cards)
    return str(module.id), module.name, "bank", cards
