"use client";

import { useMemo, useState } from "react";
import type { FlashcardBlock, GameBlock, MathBlock, QuizBlock } from "@/lib/content";
import { FormattedText } from "./FormattedText";

const GREEK: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  pi: "π",
  sigma: "σ",
  omega: "ω",
};

export function prettyLatex(value: string) {
  let text = value.trim();
  if (!text) return "";
  text = text.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1/$2");
  text = text.replace(/\\sqrt\{([^{}]+)\}/g, "√($1)");
  text = text.replace(/\\(left|right)\b/g, "");
  text = text.replace(/\\([a-zA-Z]+)/g, (_match, name: string) => GREEK[name] ?? name);
  text = text.replace(/[{}]/g, "");
  return text;
}

export function ActivityBlock({ block }: { block: MathBlock | FlashcardBlock | QuizBlock | GameBlock }) {
  if (block.type === "math") {
    const shown = prettyLatex(block.latex);
    return (
      <figure className="lp-math">
        <p>{shown || "Add a formula"}</p>
        {block.caption ? <figcaption>{block.caption}</figcaption> : null}
      </figure>
    );
  }
  if (block.type === "flashcard") return <FlashcardView block={block} />;
  if (block.type === "quiz") return <QuizView block={block} />;
  return <GameView block={block} />;
}

function FlashcardView({ block }: { block: FlashcardBlock }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <button type="button" className={`lp-flashcard${flipped ? " is-back" : ""}`} onClick={() => setFlipped((value) => !value)}>
      <span>{flipped ? "Back" : "Front"}</span>
      <strong>
        <FormattedText text={flipped ? block.back || "Add the answer" : block.front || "Add the prompt"} />
      </strong>
    </button>
  );
}

function QuizView({ block }: { block: QuizBlock }) {
  const [selected, setSelected] = useState("");
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(false);
  const correct =
    block.kind === "blank"
      ? typed.trim().toLowerCase() !== "" && typed.trim().toLowerCase() === block.answer.trim().toLowerCase()
      : selected !== "" && selected === block.correctId;
  if (block.kind === "blank") {
    return (
      <form
        className="lp-quiz"
        onSubmit={(event) => {
          event.preventDefault();
          setChecked(true);
        }}
      >
        <p>
          <FormattedText text={block.prompt || "Fill in the blank"} />
        </p>
        <input value={typed} onChange={(event) => setTyped(event.target.value)} aria-label="Your answer" />
        <button type="submit">Check</button>
        {checked ? <p className={correct ? "cms-ok" : "cms-error"}>{correct ? "Correct." : "Not quite."} {block.explanation}</p> : null}
      </form>
    );
  }
  return (
    <fieldset className="lp-quiz">
      <legend>
        <FormattedText text={block.prompt || "Choose an answer"} />
      </legend>
      {block.options.map((option) => (
        <label key={option.id}>
          <input
            type="radio"
            name={block.id}
            checked={selected === option.id}
            onChange={() => {
              setSelected(option.id);
              setChecked(true);
            }}
          />
          {option.label}
        </label>
      ))}
      {checked && selected ? (
        <p className={correct ? "cms-ok" : "cms-error"}>
          {correct ? "Correct." : block.correctId ? "Not quite." : "This question has no correct answer yet."} {block.explanation}
        </p>
      ) : null}
    </fieldset>
  );
}

function GameView({ block }: { block: GameBlock }) {
  if (block.kind === "drag") return <DragGame block={block} />;
  return <MatchGame block={block} />;
}

function MatchGame({ block }: { block: GameBlock }) {
  const rights = useMemo(() => [...block.pairs].sort((a, b) => a.right.localeCompare(b.right)), [block.pairs]);
  const [leftId, setLeftId] = useState("");
  const [matched, setMatched] = useState<Record<string, string>>({});
  const done = block.pairs.length > 0 && block.pairs.every((pair) => matched[pair.id] === pair.id);
  return (
    <div className="lp-game">
      <p>{block.prompt || block.title || "Match each pair"}</p>
      <div className="lp-match">
        <ul>
          {block.pairs.map((pair) => (
            <li key={pair.id}>
              <button type="button" className={leftId === pair.id ? "is-on" : undefined} onClick={() => setLeftId(pair.id)}>
                {pair.left || "Term"}
              </button>
            </li>
          ))}
        </ul>
        <ul>
          {rights.map((pair) => (
            <li key={pair.id}>
              <button
                type="button"
                onClick={() => {
                  if (!leftId) return;
                  setMatched((current) => ({ ...current, [leftId]: pair.id }));
                  setLeftId("");
                }}
              >
                {pair.right || "Match"}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {done ? <p className="cms-ok">All pairs match.</p> : <p className="dash-empty">Choose a term, then its match.</p>}
    </div>
  );
}

function DragGame({ block }: { block: GameBlock }) {
  const [bins, setBins] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState("");
  const done = block.items.length > 0 && block.items.every((item) => bins[item.id] === item.bin && item.bin);
  return (
    <div className="lp-game">
      <p>{block.prompt || block.title || "Drag each item into a group"}</p>
      <ul className="lp-drag-items">
        {block.items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              draggable
              onDragStart={() => setDragging(item.id)}
              className={bins[item.id] ? "is-placed" : undefined}
            >
              {item.label || "Item"}
              {bins[item.id] ? ` · ${bins[item.id]}` : ""}
            </button>
          </li>
        ))}
      </ul>
      <div className="lp-bins">
        {block.bins.map((bin) => (
          <div
            key={bin}
            className="lp-bin"
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (!dragging) return;
              setBins((current) => ({ ...current, [dragging]: bin }));
              setDragging("");
            }}
          >
            <strong>{bin}</strong>
          </div>
        ))}
      </div>
      {done ? <p className="cms-ok">Every item is in the right group.</p> : null}
    </div>
  );
}
