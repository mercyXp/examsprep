"use client";

import { useState, type DragEvent } from "react";
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from "lucide-react";
import { blockPreview, type Slide } from "@/lib/content";

export function SlideNavigator({
  slides,
  total,
  slideIndex,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onReorder,
}: {
  slides: { slide: Slide; index: number }[];
  total: number;
  slideIndex: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  function onDragStart(event: DragEvent<HTMLLIElement>, index: number) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
    setDragFrom(index);
  }

  function onDrop(event: DragEvent<HTMLLIElement>, index: number) {
    event.preventDefault();
    const from = dragFrom ?? Number(event.dataTransfer.getData("text/plain"));
    setDragFrom(null);
    setDragOver(null);
    if (Number.isNaN(from)) return;
    onReorder(from, index);
  }

  return (
    <section className="studio-nav-slides" aria-label="Slides">
      <div className="studio-nav-slides-head">
        <h3>Slides</h3>
        <button type="button" onClick={onAdd}>
          <Plus size={14} aria-hidden="true" />
          Add
        </button>
      </div>
      <ol>
        {slides.map(({ slide, index }) => {
          const preview = slide.blocks[0] ? blockPreview(slide.blocks[0]) : "Empty slide";
          const selected = index === slideIndex;
          return (
            <li
              key={slide.id}
              draggable
              className={dragOver === index ? "is-drop" : undefined}
              onDragStart={(event) => onDragStart(event, index)}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(index);
              }}
              onDragLeave={() => setDragOver((current) => (current === index ? null : current))}
              onDrop={(event) => onDrop(event, index)}
              onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
              }}
            >
              <button
                type="button"
                className={`studio-thumb${selected ? " is-on" : ""}`}
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(index)}
              >
                <span className="studio-thumb-card" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="studio-thumb-copy">
                  <strong>{slide.title || `Slide ${index + 1}`}</strong>
                  <em>{preview}</em>
                </span>
              </button>
              {selected ? (
                <div className="studio-thumb-actions">
                  <button type="button" aria-label="Move slide up" disabled={index === 0} onClick={() => onReorder(index, index - 1)}>
                    <ChevronUp size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move slide down"
                    disabled={index >= total - 1}
                    onClick={() => onReorder(index, index + 1)}
                  >
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                  <button type="button" aria-label="Duplicate slide" onClick={() => onDuplicate(index)}>
                    <Copy size={14} aria-hidden="true" />
                  </button>
                  <button type="button" aria-label="Delete slide" disabled={total < 2} onClick={() => onDelete(index)}>
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
