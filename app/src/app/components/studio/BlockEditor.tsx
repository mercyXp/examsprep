"use client";

import { useEffect, useRef, useState } from "react";
import {
  blockFromMenu,
  type BlockType,
  type ContentBlock,
  type GameBlock,
  type QuizBlock,
  type TextBlock,
} from "@/lib/content";

const MENU: { kind: "heading" | BlockType; label: string; hint: string }[] = [
  { kind: "heading", label: "Heading", hint: "Slide section" },
  { kind: "text", label: "Text", hint: "Paragraph" },
  { kind: "image", label: "Image", hint: "Figure" },
  { kind: "code", label: "Code", hint: "SQL or program" },
  { kind: "math", label: "Math formula", hint: "LaTeX" },
  { kind: "table", label: "Table", hint: "Rows and columns" },
  { kind: "flashcard", label: "Flashcard", hint: "Front and back" },
  { kind: "quiz", label: "Quiz", hint: "MCQ or fill-in-the-blank" },
  { kind: "game", label: "Game", hint: "Matching or drag-and-drop" },
];

export function BlockEditor({ blocks, onChange }: { blocks: ContentBlock[]; onChange: (blocks: ContentBlock[]) => void }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuQuery = query.startsWith("/") ? query.slice(1).trim().toLowerCase() : "";
  const items = MENU.filter((item) => item.label.toLowerCase().includes(menuQuery));

  useEffect(() => {
    setActive(0);
  }, [menuQuery]);

  function insert(kind: "heading" | BlockType) {
    onChange([...blocks, blockFromMenu(kind)]);
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function patch(next: ContentBlock) {
    onChange(blocks.map((block) => (block.id === next.id ? next : block)));
  }

  function remove(id: string) {
    if (!confirm("Remove this block from the slide?")) return;
    onChange(blocks.filter((block) => block.id !== id));
  }

  function dropOn(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = [...blocks];
    const from = next.findIndex((block) => block.id === dragId);
    const to = next.findIndex((block) => block.id === targetId);
    if (from < 0 || to < 0) return;
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
    setDragId(null);
  }

  return (
    <div className="be">
      <ol className="be-list">
        {blocks.map((block) => (
          <li
            key={block.id}
            className="be-block"
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => dropOn(block.id)}
          >
            <button
              type="button"
              className="be-handle"
              draggable
              aria-label="Drag to reorder"
              onDragStart={() => setDragId(block.id)}
              onDragEnd={() => setDragId(null)}
            >
              ⋮⋮
            </button>
            <div className="be-fields">
              <BlockFields block={block} onChange={patch} />
            </div>
            <button type="button" className="be-remove" onClick={() => remove(block.id)} aria-label="Remove block">
              Remove
            </button>
          </li>
        ))}
      </ol>
      <div className="be-compose">
        <input
          ref={inputRef}
          value={query}
          placeholder="Type / for blocks"
          aria-label="Insert a block"
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            setOpen(value.startsWith("/"));
          }}
          onKeyDown={(event) => {
            if (!open) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => Math.min(index + 1, Math.max(items.length - 1, 0)));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              const choice = items[active];
              if (choice) insert(choice.kind);
            } else if (event.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
        />
        {open ? (
          <ul className="be-menu" role="listbox">
            {items.length ? (
              items.map((item, index) => (
                <li key={item.kind}>
                  <button type="button" className={index === active ? "is-on" : undefined} onMouseDown={(event) => event.preventDefault()} onClick={() => insert(item.kind)}>
                    <strong>{item.label}</strong>
                    <span>{item.hint}</span>
                  </button>
                </li>
              ))
            ) : (
              <li className="dash-empty">No matching block</li>
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function BlockFields({ block, onChange }: { block: ContentBlock; onChange: (block: ContentBlock) => void }) {
  if (block.type === "text") return <TextFields block={block} onChange={onChange} />;
  if (block.type === "image") {
    return (
      <label>
        Image URL
        <input value={block.url} onChange={(event) => onChange({ ...block, url: event.target.value })} placeholder="https:// or an uploaded file" />
      </label>
    );
  }
  if (block.type === "code") {
    return (
      <label>
        Code
        <textarea className="is-code" value={block.code} onChange={(event) => onChange({ ...block, code: event.target.value })} />
      </label>
    );
  }
  if (block.type === "math") {
    return (
      <label>
        Formula
        <input value={block.latex} onChange={(event) => onChange({ ...block, latex: event.target.value })} placeholder="E = mc^2" />
      </label>
    );
  }
  if (block.type === "table") {
    return (
      <label>
        Rows, cells separated with |
        <textarea
          value={[block.headers.join(" | "), ...block.rows.map((row) => row.join(" | "))].join("\n")}
          onChange={(event) => {
            const lines = event.target.value.split("\n").map((line) => line.split("|").map((cell) => cell.trim()));
            const [headers, ...rows] = lines.length ? lines : [["Column 1", "Column 2"]];
            onChange({ ...block, headers: headers.length ? headers : ["Column 1"], rows: rows.length ? rows : [["", ""]] });
          }}
        />
      </label>
    );
  }
  if (block.type === "flashcard") {
    return (
      <>
        <label>
          Front
          <input value={block.front} onChange={(event) => onChange({ ...block, front: event.target.value })} />
        </label>
        <label>
          Back
          <textarea value={block.back} onChange={(event) => onChange({ ...block, back: event.target.value })} />
        </label>
      </>
    );
  }
  if (block.type === "quiz") return <QuizFields block={block} onChange={onChange} />;
  if (block.type === "game") return <GameFields block={block} onChange={onChange} />;
  if (block.type === "callout") {
    return (
      <label>
        Callout
        <textarea value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} />
      </label>
    );
  }
  if (block.type === "check") {
    return (
      <label>
        Question
        <textarea value={block.prompt} onChange={(event) => onChange({ ...block, prompt: event.target.value })} />
      </label>
    );
  }
  if (block.type === "video" || block.type === "audio") {
    return (
      <label>
        URL
        <input value={block.url} onChange={(event) => onChange({ ...block, url: event.target.value })} />
      </label>
    );
  }
  return null;
}

function TextFields({ block, onChange }: { block: TextBlock; onChange: (block: ContentBlock) => void }) {
  const label = block.variant === "heading" ? "Heading" : block.variant === "list" ? "List" : "Text";
  if (block.variant === "list") {
    return (
      <label>
        {label}
        <textarea value={block.items.join("\n")} onChange={(event) => onChange({ ...block, items: event.target.value.split("\n") })} />
      </label>
    );
  }
  return (
    <label>
      {label}
      <textarea value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} />
    </label>
  );
}

function QuizFields({ block, onChange }: { block: QuizBlock; onChange: (block: ContentBlock) => void }) {
  return (
    <>
      <label>
        Quiz type
        <select
          value={block.kind}
          onChange={(event) => onChange({ ...block, kind: event.target.value === "blank" ? "blank" : "mcq" })}
        >
          <option value="mcq">Multiple choice</option>
          <option value="blank">Fill in the blank</option>
        </select>
      </label>
      <label>
        Question
        <textarea value={block.prompt} onChange={(event) => onChange({ ...block, prompt: event.target.value })} />
      </label>
      {block.kind === "blank" ? (
        <label>
          Correct answer
          <input value={block.answer} onChange={(event) => onChange({ ...block, answer: event.target.value })} />
        </label>
      ) : (
        <>
          {block.options.map((option, index) => (
            <label key={option.id}>
              Option {index + 1}
              <input
                value={option.label}
                onChange={(event) =>
                  onChange({
                    ...block,
                    options: block.options.map((item) => (item.id === option.id ? { ...item, label: event.target.value } : item)),
                  })
                }
              />
            </label>
          ))}
          <label>
            Correct option
            <select value={block.correctId} onChange={(event) => onChange({ ...block, correctId: event.target.value })}>
              <option value="">Not set yet</option>
              {block.options.map((option, index) => (
                <option key={option.id} value={option.id}>
                  Option {index + 1}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </>
  );
}

function GameFields({ block, onChange }: { block: GameBlock; onChange: (block: ContentBlock) => void }) {
  return (
    <>
      <label>
        Game
        <select
          value={block.kind}
          onChange={(event) => onChange({ ...block, kind: event.target.value === "drag" ? "drag" : "matching" })}
        >
          <option value="matching">Matching</option>
          <option value="drag">Drag and drop</option>
        </select>
      </label>
      <label>
        Title
        <input value={block.title} onChange={(event) => onChange({ ...block, title: event.target.value })} />
      </label>
      {block.kind === "matching" ? (
        <label>
          Pairs, one per line as term | match
          <textarea
            value={block.pairs.map((pair) => `${pair.left} | ${pair.right}`).join("\n")}
            onChange={(event) =>
              onChange({
                ...block,
                pairs: event.target.value.split("\n").map((line, index) => {
                  const [left, ...rest] = line.split("|");
                  return { id: block.pairs[index]?.id || `${block.id}-${index}`, left: (left || "").trim(), right: rest.join("|").trim() };
                }),
              })
            }
          />
        </label>
      ) : (
        <label>
          Items, one per line as label | group
          <textarea
            value={block.items.map((item) => `${item.label} | ${item.bin}`).join("\n")}
            onChange={(event) => {
              const items = event.target.value.split("\n").map((line, index) => {
                const [label, ...rest] = line.split("|");
                return { id: block.items[index]?.id || `${block.id}-item-${index}`, label: (label || "").trim(), bin: rest.join("|").trim() };
              });
              const bins = [...new Set(items.map((item) => item.bin).filter(Boolean))];
              onChange({ ...block, items, bins: bins.length ? bins : block.bins });
            }}
          />
        </label>
      )}
    </>
  );
}
