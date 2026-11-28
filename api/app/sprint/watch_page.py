"""Read-only spectator page for one run. Byte embeds it when watchUrl is set."""

from __future__ import annotations

import json


def render_watch_html(run_id: str) -> str:
    safe_id = json.dumps(run_id)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ExamSprint</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #07111f;
      --card: #10233a;
      --ink: #f4f7fb;
      --muted: #93a4bd;
      --amber: #ffb703;
      --mint: #2ee6a6;
      --coral: #ff5d73;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(900px 420px at 10% -10%, rgba(255,183,3,.18), transparent 60%),
        radial-gradient(700px 380px at 110% 0%, rgba(46,230,166,.12), transparent 55%),
        var(--bg);
      color: var(--ink);
      font: 16px/1.45 ui-sans-serif, system-ui, sans-serif;
    }}
    main {{ max-width: 720px; margin: 0 auto; padding: 28px 20px 48px; }}
    .kicker {{ letter-spacing: .22em; font-size: 12px; color: var(--amber); font-weight: 700; }}
    h1 {{ margin: 8px 0 0; font-size: 36px; letter-spacing: -0.04em; }}
    .meta {{ color: var(--muted); margin-top: 6px; }}
    .score {{
      display: flex; gap: 12px; margin: 22px 0;
    }}
    .pill {{
      background: var(--card); border-radius: 16px; padding: 12px 16px; min-width: 96px;
    }}
    .pill b {{ display: block; font-size: 26px; }}
    .pill span {{ color: var(--muted); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }}
    .card {{
      background: rgba(16,35,58,.92); border: 1px solid rgba(255,255,255,.06);
      border-radius: 22px; padding: 22px;
    }}
    .prompt {{ font-size: 22px; font-weight: 700; letter-spacing: -0.03em; }}
    .choice {{
      margin-top: 10px; padding: 12px 14px; border-radius: 14px; background: #0c1b2e;
      display: flex; gap: 12px; align-items: flex-start;
    }}
    .letter {{
      width: 28px; height: 28px; border-radius: 9px; display: grid; place-items: center;
      background: #1c3350; color: var(--amber); font-weight: 800; flex: none;
    }}
    .good {{ color: var(--mint); }}
    .bad {{ color: var(--coral); }}
    .note {{ margin-top: 14px; color: var(--muted); }}
  </style>
</head>
<body>
  <main>
    <div class="kicker">EXAMSPRINT</div>
    <h1 id="title">Waiting for the run</h1>
    <p class="meta" id="meta"></p>
    <div class="score">
      <div class="pill"><b id="score">0</b><span>points</span></div>
      <div class="pill"><b id="correct">0</b><span>correct</span></div>
      <div class="pill"><b id="round">1</b><span>round</span></div>
    </div>
    <section class="card" id="stage">Loading this run…</section>
  </main>
  <script>
    const runId = {safe_id};
    const stage = document.getElementById('stage');
    function esc(value) {{
      return String(value ?? '').replace(/[&<>"]/g, (ch) => ({{
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
      }}[ch]));
    }}
    async function tick() {{
      try {{
        const response = await fetch('/api/sprint/watch/' + runId, {{ cache: 'no-store' }});
        if (!response.ok) {{
          stage.textContent = 'This run is not on the board.';
          return;
        }}
        const state = await response.json();
        document.getElementById('title').textContent = state.displayName || 'ExamSprint';
        document.getElementById('meta').textContent =
          (state.playerKind === 'agent' ? 'Agent' : 'Player') + ' · ' + (state.subject || '') +
          ' · ' + (state.phase || '');
        document.getElementById('score').textContent = state.score ?? 0;
        document.getElementById('correct').textContent = state.correct ?? 0;
        document.getElementById('round').textContent = (state.round || 1) + '/' + (state.rounds || 1);
        if (state.question) {{
          const choices = (state.question.choices || []).map((choice) =>
            '<div class="choice"><div class="letter">' + esc(choice.letter) + '</div><div>' +
            esc(choice.label) + '</div></div>'
          ).join('');
          stage.innerHTML = '<div class="prompt">' + esc(state.question.prompt) + '</div>' + choices;
        }} else if (state.status === 'finished') {{
          const tone = state.outcome === 'flawless' ? 'good' : '';
          stage.innerHTML = '<div class="prompt ' + tone + '">' +
            (state.outcome === 'flawless' ? 'Flawless run' : 'Run complete') +
            '</div><p class="note">' + esc(state.score) + ' points</p>';
        }} else if (state.phase === 'round_break' && state.roundSummary) {{
          stage.innerHTML = '<div class="prompt">Round ' + esc(state.roundSummary.round) +
            ' complete</div><p class="note">' + esc(state.roundSummary.correct) + ' of ' +
            esc(state.roundSummary.questions) + ' correct</p>';
        }} else {{
          stage.textContent = 'Waiting for the next card.';
        }}
      }} catch (error) {{
        stage.textContent = 'Reconnecting…';
      }}
    }}
    tick();
    setInterval(tick, 2000);
  </script>
</body>
</html>
"""
