"use client";

import type { ContentBlock } from "@/lib/content";

const SQL_WORDS = /\b(SELECT|FROM|WHERE|AND|OR|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|JOIN|ON|AS|NOT|NULL|PRIMARY|KEY)\b/gi;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function highlight(code: string, language: string) {
  const safe = escapeHtml(code);
  if (language !== "sql") return safe;
  return safe.replace(SQL_WORDS, "<mark>$1</mark>");
}

export function BlockView({
  block,
  revealedText,
  check,
}: {
  block: ContentBlock;
  revealedText?: string;
  check?: {
    selectedId: string | null;
    onSelect: (id: string) => void;
    locked?: boolean;
  };
}) {
  if (block.type === "text") {
    const text = revealedText ?? (block.variant === "list" ? "" : block.text);
    if (block.variant === "heading") return <h3 className="lp-h">{text}</h3>;
    if (block.variant === "definition") return <p className="lp-def">{text}</p>;
    if (block.variant === "list") {
      const items = revealedText ? revealedText.split("\n").filter(Boolean) : block.items;
      return (
        <ul className="lp-list">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    }
    return <p className="lp-p">{text}</p>;
  }
  if (block.type === "code") {
    return (
      <figure className="lp-code">
        <figcaption>{block.language}</figcaption>
        <pre>
          <code dangerouslySetInnerHTML={{ __html: highlight(block.code, block.language) }} />
        </pre>
      </figure>
    );
  }
  if (block.type === "image") {
    if (!block.url) return <p className="dash-empty">Image URL missing.</p>;
    return <img className="lp-image" src={block.url} alt={block.alt || "Lesson diagram"} />;
  }
  if (block.type === "callout") {
    return (
      <aside className={`lp-callout is-${block.tone}`}>
        <strong>{block.tone}</strong>
        <p>{block.text}</p>
      </aside>
    );
  }
  const selected = check?.selectedId;
  return (
    <fieldset className="lp-check">
      <legend>{block.prompt}</legend>
      {block.options.map((option) => (
        <label key={option.id}>
          <input
            type="radio"
            name={block.id}
            checked={selected === option.id}
            disabled={check?.locked}
            onChange={() => check?.onSelect(option.id)}
          />
          {option.label}
        </label>
      ))}
      {check?.locked && selected ? (
        <p className={selected === block.correctId ? "cms-ok" : "cms-error"}>
          {selected === block.correctId ? block.feedbackCorrect || "Correct." : block.feedbackWrong || "Not quite."} {block.explanation}
        </p>
      ) : null}
    </fieldset>
  );
}
