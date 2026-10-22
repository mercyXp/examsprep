"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import {
  blockVisible,
  revealedForBlock,
  unitsForSlide,
  type ContentBlock,
  type RevealUnit,
  type Slide,
} from "@/lib/content";
import { BlockView } from "./BlockView";

export type CheckState = Record<string, { selectedId?: string; correct?: boolean }>;

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest("button, a, input, label, textarea, select, audio, video, iframe, .lp-check, .lp-embed"),
  );
}

export function SlideStage({
  slide,
  revealed,
  checks,
  onAnswer,
  onAdvance,
  interactive = false,
  notes = false,
  selectedId,
  onSelect,
  onRemove,
  numbered = false,
  children,
}: {
  slide: Slide;
  revealed: number;
  checks?: CheckState;
  onAnswer?: (block: Extract<ContentBlock, { type: "check" }>, selectedId: string) => void;
  onAdvance?: () => void;
  interactive?: boolean;
  notes?: boolean;
  selectedId?: string | null;
  onSelect?: (blockId: string) => void;
  onRemove?: (blockId: string) => void;
  numbered?: boolean;
  children?: ReactNode;
}) {
  const units = notes ? unitsForSlide(slide, { includeNotes: true }) : unitsForSlide(slide);
  const count = notes ? units.length : revealed;
  const titleVisible = notes || slide.titleImmediate !== false || count > 0;

  function handleClick(event: MouseEvent<HTMLElement>) {
    if (!interactive || notes) return;
    if (isInteractiveTarget(event.target)) return;
    onAdvance?.();
  }

  return (
    <article
      className={`player-stage dash-card is-${slide.layout || "text"}${interactive && !notes ? " is-live" : ""}`}
      style={slide.background ? { background: slide.background } : undefined}
      onClick={handleClick}
    >
      {titleVisible ? <p className="dash-kicker">{slide.title}</p> : null}
      {slide.blocks.map((block, blockIndex) => {
        if (!notes && block.notesOnly) return null;
        if (!notes && !blockVisible(units, count, blockIndex)) return null;
        const unit = latestUnit(units, count, blockIndex);
        const number = units.findIndex((item, index) => index < count && item.blockIndex === blockIndex) + 1;
        const wrapping = onSelect ? (
          <button
            type="button"
            className={`lp-block cms-plain${selectedId === block.id ? " is-on" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(block.id);
            }}
          >
            <BlockBody block={block} units={units} count={count} blockIndex={blockIndex} checks={checks} onAnswer={onAnswer} />
          </button>
        ) : (
          <BlockBody block={block} units={units} count={count} blockIndex={blockIndex} checks={checks} onAnswer={onAnswer} />
        );
        return (
          <div key={block.id} className={`lp-reveal is-${unit?.animation || "fade"}${numbered ? " is-numbered" : ""}`}>
            {numbered && number > 0 ? <span className="lp-num">{number}</span> : null}
            {wrapping}
            {onRemove && selectedId === block.id ? (
              <button
                type="button"
                className="lp-remove"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(block.id);
                }}
              >
                Remove
              </button>
            ) : null}
          </div>
        );
      })}
      {children}
    </article>
  );
}

function BlockBody({
  block,
  units,
  count,
  blockIndex,
  checks,
  onAnswer,
}: {
  block: ContentBlock;
  units: RevealUnit[];
  count: number;
  blockIndex: number;
  checks?: CheckState;
  onAnswer?: (block: Extract<ContentBlock, { type: "check" }>, selectedId: string) => void;
}) {
  return (
    <BlockView
      block={block}
      revealedText={block.type === "text" ? revealedForBlock(block, units, count, blockIndex) : undefined}
      check={
        block.type === "check"
          ? {
              selectedId: checks?.[block.id]?.selectedId ?? null,
              locked: Boolean(checks?.[block.id]?.selectedId),
              onSelect: (id) => onAnswer?.(block, id),
            }
          : undefined
      }
    />
  );
}

function latestUnit(units: RevealUnit[], count: number, blockIndex: number) {
  let found: RevealUnit | undefined;
  units.forEach((unit, index) => {
    if (index < count && unit.blockIndex === blockIndex) found = unit;
  });
  return found;
}

export function handlePlayerKey(event: KeyboardEvent, advance: () => void, back: () => void) {
  if (isInteractiveTarget(event.target)) return;
  if (event.key === "ArrowRight" || event.key === " " || event.key === "Spacebar") {
    event.preventDefault();
    advance();
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    back();
  }
}
