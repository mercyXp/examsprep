"use client";

import Link from "next/link";
import { BookOpen, Info } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { lessonStatusTone, statusLabel } from "@/lib/cms";

export function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export function BackLink({ href }: { href: string }) {
  return (
    <Link className="lesson-back" href={href}>
      ← Back
    </Link>
  );
}

export function InfoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="lesson-banner" role="note">
      <Info size={18} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

export function ChapterMark() {
  return (
    <span className="lesson-chapter-icon" aria-hidden="true">
      <BookOpen size={18} />
    </span>
  );
}

export function LessonStatus({ status }: { status: string }) {
  return <span className={`lesson-pill is-${lessonStatusTone(status)}`}>{statusLabel(status)}</span>;
}

export function GuideDialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("input, textarea")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  function trap(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab" || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>("button, input, textarea, select, a[href]")).filter(
      (el) => !el.hasAttribute("disabled"),
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="admin-dialog lesson-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="admin-dialog-scrim" aria-label="Close dialog" onClick={onClose} />
      <article ref={panelRef} onKeyDown={trap}>
        <header>
          <h2 id={titleId}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        {children}
      </article>
    </div>
  );
}

type MenuBox = { top?: number; bottom?: number; right: number };

export function RowMenu({
  label,
  open,
  onToggle,
  onClose,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const focused = useRef(false);
  const [box, setBox] = useState<MenuBox | null>(null);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      focused.current = false;
      return;
    }
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const openUp = window.innerHeight - rect.bottom < 220 && rect.top > 220;
      const right = Math.max(8, window.innerWidth - rect.right);
      setBox(openUp ? { bottom: window.innerHeight - rect.top + 6, right } : { top: rect.bottom + 6, right });
    };
    place();
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeRef.current();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !box || focused.current) return;
    focused.current = true;
    menuRef.current?.querySelector<HTMLElement>("button:not(:disabled), a[href]")?.focus();
  }, [open, box]);

  return (
    <div className="lesson-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="lesson-kebab"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      >
        <span aria-hidden="true">⋮</span>
      </button>
      {open && box
        ? createPortal(
            <div ref={menuRef} className="admin-pop lesson-pop" role="menu" style={{ top: box.top, bottom: box.bottom, right: box.right }}>
              {children}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function MenuButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button type="button" role="menuitem" className={danger ? "is-danger" : undefined} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function MenuLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link role="menuitem" href={href}>
      {children}
    </Link>
  );
}
