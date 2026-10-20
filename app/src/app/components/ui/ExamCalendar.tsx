"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatExamDate, todayISO } from "@/lib/study";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function fromISO(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month: (month ?? 1) - 1, day: day ?? 1 };
}

function toISO(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthTitle(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export default function ExamCalendar({
  values,
  onToggle,
  min,
}: {
  values: string[];
  onToggle: (iso: string) => void;
  min?: string;
}) {
  const minDate = min ?? todayISO();
  const seed = fromISO(values[0] || minDate);
  const [view, setView] = useState({ year: seed.year, month: seed.month });
  const minParts = fromISO(minDate);
  const today = todayISO();
  const selected = useMemo(() => new Set(values), [values]);

  const cells = useMemo(() => {
    const first = new Date(view.year, view.month, 1);
    const pad = (first.getDay() + 6) % 7;
    const days = new Date(view.year, view.month + 1, 0).getDate();
    const slots: Array<{ iso: string; day: number } | null> = Array.from({ length: pad }, () => null);
    for (let day = 1; day <= days; day += 1) {
      slots.push({ iso: toISO(view.year, view.month, day), day });
    }
    while (slots.length % 7) slots.push(null);
    return slots;
  }, [view.month, view.year]);

  const prevDisabled = view.year < minParts.year || (view.year === minParts.year && view.month <= minParts.month);

  return (
    <div className="exam-cal" role="group" aria-label={`Exam calendar, ${monthTitle(view.year, view.month)}`}>
      <div className="exam-cal-nav">
        <button
          type="button"
          aria-label="Previous month"
          disabled={prevDisabled}
          onClick={() =>
            setView((current) => {
              const date = new Date(current.year, current.month - 1, 1);
              return { year: date.getFullYear(), month: date.getMonth() };
            })
          }
        >
          ‹
        </button>
        <strong>{monthTitle(view.year, view.month)}</strong>
        <button
          type="button"
          aria-label="Next month"
          onClick={() =>
            setView((current) => {
              const date = new Date(current.year, current.month + 1, 1);
              return { year: date.getFullYear(), month: date.getMonth() };
            })
          }
        >
          ›
        </button>
      </div>
      <div className="exam-cal-week" aria-hidden="true">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="exam-cal-grid">
        {cells.map((cell, index) =>
          cell ? (
            <button
              key={cell.iso}
              type="button"
              disabled={cell.iso < minDate}
              className={[selected.has(cell.iso) ? "is-on" : "", cell.iso === today ? "is-today" : ""].filter(Boolean).join(" ") || undefined}
              aria-pressed={selected.has(cell.iso)}
              aria-label={cell.iso}
              onClick={() => onToggle(cell.iso)}
            >
              {cell.day}
            </button>
          ) : (
            <span key={`empty-${index}`} className="is-empty" />
          ),
        )}
      </div>
    </div>
  );
}

export function ExamDatePicker({
  values,
  onChange,
  min,
  labelledBy,
}: {
  values: string[];
  onChange: (dates: string[]) => void;
  min?: string;
  labelledBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(iso: string) {
    onChange(values.includes(iso) ? values.filter((item) => item !== iso) : [...values, iso].sort());
  }

  const summary = values.length
    ? `${values.length} date${values.length === 1 ? "" : "s"} selected`
    : "Select exam dates";

  return (
    <div className="exam-pick" ref={root}>
      <div className="exam-pick-wrap">
        <button
          type="button"
          className={`exam-pick-btn${open ? " is-open" : ""}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-labelledby={labelledBy}
          onClick={() => setOpen((current) => !current)}
        >
          <span>{summary}</span>
          <span aria-hidden="true">▾</span>
        </button>
        {open ? (
          <div className="exam-pick-panel" role="dialog" aria-label="Choose exam dates">
            <p className="exam-pick-hint">Tap dates to add or remove them.</p>
            <ExamCalendar values={values} min={min} onToggle={toggle} />
          </div>
        ) : null}
      </div>
      {values.length ? (
        <ul className="exam-pick-chips">
          {values.map((iso) => (
            <li key={iso}>
              <button type="button" onClick={() => toggle(iso)}>
                {formatExamDate(iso)}
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="onb-cal-picked">Select one or more dates from the calendar.</p>
      )}
    </div>
  );
}
