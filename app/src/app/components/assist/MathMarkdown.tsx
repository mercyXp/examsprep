"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import { Fragment, type ReactNode } from "react";

export function MathMarkdown({ text }: { text: string }) {
  const source = text || "";
  const blocks = source.split(/\$\$([\s\S]+?)\$\$/g);
  return (
    <div className="math-md">
      {blocks.map((block, index) =>
        index % 2 === 1 ? (
          <div key={index} className="math-display" dangerouslySetInnerHTML={{ __html: renderKatex(block, true) }} />
        ) : (
          <Fragment key={index}>{renderText(block)}</Fragment>
        ),
      )}
    </div>
  );
}

function renderText(block: string) {
  return block.split(/\n{2,}/).map((paragraph, index) => {
    const lines = paragraph.split("\n").filter((line) => line.trim());
    if (!lines.length) return null;
    if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
      return (
        <ul key={index}>
          {lines.map((line, lineIndex) => (
            <li key={lineIndex}>{renderInline(line.replace(/^\s*[-*]\s+/, ""))}</li>
          ))}
        </ul>
      );
    }
    return <p key={index}>{renderInline(paragraph)}</p>;
  });
}

function renderInline(value: string): ReactNode[] {
  const parts = value.split(/(\$[^$\n]+\$|\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
      return <span key={index} dangerouslySetInnerHTML={{ __html: renderKatex(part.slice(1, -1), false) }} />;
    }
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function renderKatex(value: string, display: boolean) {
  try {
    return katex.renderToString(value.trim(), { displayMode: display, throwOnError: false, strict: "ignore" });
  } catch {
    return display ? `<pre>${escapeHtml(value)}</pre>` : escapeHtml(value);
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] || character);
}
