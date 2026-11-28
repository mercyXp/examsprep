"""BYTE_GAME.md body. The prose is the agent's prompt; the JSON is the contract.

Spec: https://app.bytearena.fun/api/game-spec
"""

from __future__ import annotations

import json

PLACEHOLDER_BASE = "https://YOUR_PUBLIC_API"


def render_manifest(base_url: str) -> str:
    base = base_url.rstrip("/") or PLACEHOLDER_BASE
    contract = {
        "name": "ExamSprint",
        "api": {
            "baseUrl": base,
            "start": {
                "method": "POST",
                "path": "/api/sprint/agent/start",
                "body": {"agentName": "{{callsign}}"},
                "save": {"apiKey": "apiKey", "runId": "runId"},
            },
            "auth": {"header": "Authorization", "value": "Bearer {{apiKey}}"},
            "state": {"method": "GET", "path": "/api/sprint/agent/state"},
            "actions": [
                {
                    "name": "answer",
                    "description": "Answer the current card with one legal letter.",
                    "method": "POST",
                    "path": "/api/sprint/agent/answer",
                    "body": {"choice": "{{choice}}", "moveId": "{{moveId}}"},
                    "params": {
                        "choice": {
                            "type": "string",
                            "choices": ["A", "B", "C", "D"],
                            "required": True,
                        },
                        "moveId": {"type": "string", "required": True},
                    },
                },
                {
                    "name": "continue",
                    "description": "Start the next round. Only when phase is round_break.",
                    "method": "POST",
                    "path": "/api/sprint/agent/continue",
                    "body": {"moveId": "{{moveId}}"},
                    "params": {"moveId": {"type": "string", "required": True}},
                },
                {
                    "name": "quit",
                    "description": "End the run and keep the score so far.",
                    "method": "POST",
                    "path": "/api/sprint/agent/quit",
                    "body": {"moveId": "{{moveId}}"},
                    "params": {"moveId": {"type": "string", "required": True}},
                    "terminal": True,
                },
            ],
            "finish": {"path": "status", "equals": ["finished"]},
            "result": {
                "win": {"path": "outcome", "equals": ["flawless"]},
                "score": {"path": "score", "label": "pts"},
            },
            "watchUrl": f"{base}/sprint/watch/{{{{runId}}}}",
        },
    }
    # Byte substitutes {{runId}}. Keep the braces literal; do not format them here.
    contract["api"]["watchUrl"] = base + "/sprint/watch/{{runId}}"
    body = json.dumps(contract, indent=2)
    prose = """# ExamSprint

ExamSprint is a timed knowledge challenge. You win by answering every card correctly. A perfect run sets outcome to flawless. Anything else that reaches the last card is still scored, and the board ranks by score.

Nine cards, three rounds of three, from the practice deck unless a subject was chosen at the start. Each card has two to four choices labelled A, B, C, and D. Read legalChoices and pick one of those letters. A letter that is not legal does nothing: the error says so, and the same card stays up. The moves counter climbs only when a move lands.

The clock is paused for you. timerPaused is true, and a slow answer still scores 100 points when it is correct. Humans are the ones racing the 15 second clock. Do not wait for a timer.

Between rounds, phase is round_break. The only useful action then is continue. answer will tell you to continue, and it will not spend the card.

Send a new moveId on every action (any short unique string). Repeating a moveId returns the same state and does not score twice. Reading state changes nothing. When status is finished the run stays finished, including after quit. Narrate a streak, the last card of a round, and a flawless finish. Trust the JSON if this prose ever disagrees with it.
"""
    return prose + "\n```json\n" + body + "\n```\n"


def manifest_contract(text: str) -> dict:
    start = text.index("```json") + len("```json")
    end = text.index("```", start)
    return json.loads(text[start:end])
