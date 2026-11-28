"""Pure ExamSprint rules.

Humans answer against a clock and earn a speed bonus. Agents play the same
cards one discrete choice at a time, with the clock paused, which is what
Byte Arena can do: a closed list of moves and a full JSON state.
"""

from __future__ import annotations

from dataclasses import dataclass, field

BASE_POINTS = 100
MAX_SPEED_BONUS = 50
ROUND_SIZE = 3
QUESTION_LIMIT_MS = 15_000
# Network delay after the clock hits zero still counts the answer.
ANSWER_GRACE_MS = 1_500
DECK_SIZE = 9
HIGH_SCORE = 400
SPEEDSTER_MS = 5_000

ACHIEVEMENTS: dict[str, tuple[str, str]] = {
    "first_finish": ("First bell", "Finished a knowledge challenge."),
    "perfect_round": ("Clean round", "Answered every card in a round correctly."),
    "flawless": ("Flawless", "Every card in the run was correct."),
    "hat_trick": ("Hat trick", "Three correct answers in a row."),
    "speedster": ("Speedster", "Three correct answers, averaging under five seconds."),
    "high_score": ("High score", "Scored 400 or more in one run."),
    "closer": ("Closer", "Nailed the final card."),
}


@dataclass
class Run:
    player_kind: str
    subject_id: str
    subject_name: str
    source: str
    deck: list[dict]
    index: int = 0
    status: str = "playing"
    phase: str = "question"
    score: int = 0
    speed_bonus: int = 0
    correct: int = 0
    streak: int = 0
    best_streak: int = 0
    moves: int = 0
    answers: list[dict] = field(default_factory=list)
    last_move_id: str | None = None
    shown_at_ms: int = 0
    outcome: str = ""
    round_size: int = ROUND_SIZE
    limit_ms: int = QUESTION_LIMIT_MS
    display_name: str = ""


def speed_bonus(elapsed_ms: int, limit_ms: int) -> int:
    elapsed = max(0, elapsed_ms)
    if elapsed >= limit_ms or limit_ms <= 0:
        return 0
    return round(MAX_SPEED_BONUS * (limit_ms - elapsed) / limit_ms)


def new_run(
    *,
    player_kind: str,
    subject_id: str,
    subject_name: str,
    source: str,
    deck: list[dict],
    now_ms: int,
    display_name: str,
) -> Run:
    return Run(
        player_kind=player_kind,
        subject_id=subject_id,
        subject_name=subject_name,
        source=source,
        deck=deck,
        shown_at_ms=now_ms,
        display_name=display_name,
    )


def _letters(card: dict) -> str:
    return "ABCD"[: len(card["choices"])]


def resolve_letter(run: Run, letter: str) -> tuple[str | None, str | None]:
    """Map A–D onto the current card. An illegal letter does not consume it."""
    if run.status == "finished":
        return None, "This run is already over."
    if run.phase != "question" or run.index >= len(run.deck):
        return None, "There is no card to answer. Continue if a round just ended."
    card = run.deck[run.index]
    legal = _letters(card)
    chosen = letter.strip().upper()
    if chosen not in legal:
        listed = ", ".join(legal)
        return None, f"{chosen or 'That'} is not on this card. Legal choices: {listed}."
    return card["choices"]["ABCD".index(chosen)]["id"], None


def apply_answer(run: Run, *, choice_id: str | None, move_id: str, now_ms: int) -> str | None:
    """Apply one answer. None means the move landed (including an identical retry)."""
    if not move_id:
        return "Send a moveId with this action so a retry cannot score twice."
    if run.last_move_id == move_id:
        return None
    if run.status == "finished":
        return "This run is already over."
    if run.phase != "question" or run.index >= len(run.deck):
        return "The round is on a break. Continue when you are ready."

    card = run.deck[run.index]
    legal_ids = [choice["id"] for choice in card["choices"]]
    if choice_id is not None and choice_id not in legal_ids:
        return "That choice is not on this card."

    elapsed = max(0, now_ms - run.shown_at_ms)
    timed_out = run.player_kind == "human" and elapsed > run.limit_ms + ANSWER_GRACE_MS
    selected = choice_id if choice_id in legal_ids else None
    correct_ids = list(card["correctIds"])
    correct = (
        not timed_out
        and selected is not None
        and len(correct_ids) == 1
        and selected == correct_ids[0]
    )
    points = 0
    bonus = 0
    if correct and run.player_kind == "human":
        counted = min(elapsed, run.limit_ms)
        bonus = speed_bonus(counted, run.limit_ms) if elapsed <= run.limit_ms else 0
        points = BASE_POINTS + bonus
        run.streak += 1
        run.correct += 1
    elif correct:
        points = BASE_POINTS
        run.streak += 1
        run.correct += 1
    else:
        run.streak = 0
    run.best_streak = max(run.best_streak, run.streak)
    run.score += points
    run.speed_bonus += bonus

    letter = None
    if selected is not None:
        letter = "ABCD"[legal_ids.index(selected)]
    correct_index = legal_ids.index(correct_ids[0])
    run.answers.append(
        {
            "moveId": move_id,
            "choiceId": selected,
            "letter": letter,
            "correct": correct,
            "points": points,
            "speedBonus": bonus,
            "elapsedMs": elapsed,
            "explanation": card["explanation"],
            "correctLabel": card["choices"][correct_index]["label"],
            "prompt": card["prompt"],
        }
    )
    run.index += 1
    run.moves += 1
    run.last_move_id = move_id
    if run.index >= len(run.deck):
        _finish(run)
    elif run.index % run.round_size == 0:
        run.phase = "round_break"
    else:
        run.phase = "question"
        run.shown_at_ms = now_ms
    return None


def apply_continue(run: Run, *, move_id: str, now_ms: int) -> str | None:
    if not move_id:
        return "Send a moveId with this action so a retry cannot advance twice."
    if run.last_move_id == move_id:
        return None
    if run.status == "finished":
        return "This run is already over."
    if run.phase != "round_break":
        return "Continue is only available between rounds."
    run.phase = "question"
    run.shown_at_ms = now_ms
    run.moves += 1
    run.last_move_id = move_id
    return None


def apply_quit(run: Run, *, move_id: str) -> str | None:
    if run.status == "finished":
        return None
    if not move_id:
        return "Send a moveId with this action."
    run.status = "finished"
    run.phase = "finished"
    run.outcome = "quit"
    run.moves += 1
    run.last_move_id = move_id
    return None


def _finish(run: Run) -> None:
    run.status = "finished"
    run.phase = "finished"
    perfect = len(run.deck) > 0 and run.correct == len(run.deck)
    run.outcome = "flawless" if perfect else "finished"


def perfect_rounds(run: Run) -> int:
    if not run.answers:
        return 0
    count = 0
    total = len(run.deck)
    groups: dict[int, list[dict]] = {}
    for index, answer in enumerate(run.answers):
        groups.setdefault(index // run.round_size, []).append(answer)
    for group_index, group in groups.items():
        start = group_index * run.round_size
        expected = min(run.round_size, total - start)
        if expected > 0 and len(group) == expected and all(item["correct"] for item in group):
            count += 1
    return count


def unlocked_codes(run: Run) -> list[str]:
    if run.status != "finished" or run.outcome == "quit" or not run.deck:
        return []
    codes = ["first_finish"]
    if perfect_rounds(run) > 0:
        codes.append("perfect_round")
    if run.outcome == "flawless":
        codes.append("flawless")
    if run.best_streak >= 3:
        codes.append("hat_trick")
    correct_times = [item["elapsedMs"] for item in run.answers if item["correct"]]
    if (
        run.player_kind == "human"
        and len(correct_times) >= 3
        and (sum(correct_times) / len(correct_times)) <= SPEEDSTER_MS
    ):
        codes.append("speedster")
    if run.score >= HIGH_SCORE:
        codes.append("high_score")
    if len(run.answers) == len(run.deck) and run.answers[-1]["correct"]:
        codes.append("closer")
    return codes


def _round_summary(run: Run) -> dict | None:
    if run.phase != "round_break":
        return None
    round_number = run.index // run.round_size
    start = (round_number - 1) * run.round_size
    chunk = run.answers[start : run.index]
    return {
        "round": round_number,
        "correct": sum(1 for item in chunk if item["correct"]),
        "questions": len(chunk),
        "points": sum(item["points"] for item in chunk),
    }


def public_state(run: Run, now_ms: int) -> dict:
    """Spectator-safe state. Correct answers stay off the current card."""
    total = len(run.deck)
    rounds = max(1, (total + run.round_size - 1) // run.round_size) if total else 1
    if run.status == "finished":
        current_round = rounds
    elif run.phase == "round_break":
        current_round = max(1, run.index // run.round_size)
    else:
        current_round = min(rounds, (run.index // run.round_size) + 1)

    question = None
    if run.phase == "question" and run.index < total:
        card = run.deck[run.index]
        question = {
            "prompt": card["prompt"],
            "number": run.index + 1,
            "choices": [
                {"id": choice["id"], "letter": "ABCD"[index], "label": choice["label"]}
                for index, choice in enumerate(card["choices"])
            ],
        }
    remaining = None
    if question is not None and run.player_kind == "human":
        elapsed = max(0, now_ms - run.shown_at_ms)
        remaining = max(0, run.limit_ms - elapsed)
    last = run.answers[-1] if run.answers else None
    show_review = run.phase != "question" or run.status == "finished"
    review = []
    if show_review:
        review = [
            {
                "prompt": item["prompt"],
                "correct": item["correct"],
                "letter": item["letter"],
                "points": item["points"],
                "speedBonus": item["speedBonus"],
                "explanation": item["explanation"],
                "correctLabel": item["correctLabel"],
            }
            for item in run.answers
        ]
    return {
        "status": "finished" if run.status == "finished" else "playing",
        "phase": "finished" if run.status == "finished" else run.phase,
        "outcome": run.outcome or None,
        "playerKind": run.player_kind,
        "displayName": run.display_name,
        "subjectId": run.subject_id,
        "subject": run.subject_name,
        "source": run.source,
        "round": current_round,
        "rounds": rounds,
        "questionNumber": (run.index if run.phase != "question" else run.index + 1),
        "questionCount": total,
        "score": run.score,
        "speedBonus": run.speed_bonus,
        "correct": run.correct,
        "streak": run.streak,
        "bestStreak": run.best_streak,
        "moves": run.moves,
        "limitMs": run.limit_ms if run.player_kind == "human" else None,
        "timerPaused": run.player_kind == "agent",
        "remainingMs": remaining,
        "serverNowMs": now_ms,
        "canAnswer": run.phase == "question" and run.status != "finished",
        "canContinue": run.phase == "round_break",
        "legalChoices": [choice["letter"] for choice in question["choices"]] if question else [],
        "question": question,
        "lastResult": None
        if last is None
        else {
            "correct": last["correct"],
            "points": last["points"],
            "speedBonus": last["speedBonus"],
            "letter": last["letter"],
            "explanation": last["explanation"],
            "correctLabel": last["correctLabel"],
        },
        "roundSummary": _round_summary(run),
        "review": review,
        "error": None,
    }
