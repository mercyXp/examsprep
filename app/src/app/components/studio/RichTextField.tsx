"use client";

import { useRef } from "react";
import { applyFormat } from "@/lib/rich-text";
import { FormattedText } from "@/app/components/learn/FormattedText";

const ACTIONS = [
  { id: "bold", label: "B", title: "Bold", open: "**" },
  { id: "italic", label: "I", title: "Italic", open: "*" },
  { id: "underline", label: "U", title: "Underline", open: "++" },
  { id: "highlight", label: "H", title: "Highlight", open: "==" },
] as const;

export function RichTextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);

  function insertBreak() {
    const area = field.current;
    const start = area?.selectionStart ?? value.length;
    const end = area?.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}\n${value.slice(end)}`;
    onChange(next);
    const caret = start + 1;
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(caret, caret);
    });
  }

  function format(open: string) {
    const area = field.current;
    const start = area?.selectionStart ?? value.length;
    const end = area?.selectionEnd ?? value.length;
    const next = applyFormat(value, start, end, open);
    onChange(next.value);
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(next.start, next.end);
    });
  }

  return (
    <div className="studio-rich">
      <span>{label}</span>
      <div className="studio-format" role="toolbar" aria-label={`${label} formatting`}>
        {ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            title={action.title}
            className={`is-${action.id}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => format(action.open)}
          >
            {action.label}
          </button>
        ))}
        <button type="button" title="Next line" className="is-break" onMouseDown={(event) => event.preventDefault()} onClick={insertBreak}>
          Next line
        </button>
      </div>
      <textarea
        ref={field}
        value={value}
        rows={4}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          insertBreak();
        }}
      />
      {value.trim() ? (
        <p className="studio-rich-preview">
          <FormattedText text={value} />
        </p>
      ) : (
        <p className="cms-muted">Select words, then choose bold, italic, underline, or highlight.</p>
      )}
    </div>
  );
}
