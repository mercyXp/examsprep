"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { loadModules, loadScope, saveModule, type AdminModule, type AdminScope } from "@/lib/cms";

const PAGE_SIZE = 6;
const EMPTY = { code: "", name: "", description: "", objectives: "", coverColor: "", status: "PUBLISHED", programmeId: "" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(iso: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!match) return "—";
  return `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}

function tintFor(code: string, cover: string | null) {
  if (cover && /^#[0-9a-fA-F]{6}$/.test(cover)) return cover;
  const palette = ["#7c5cfc", "#1f9d62", "#e07a2f", "#3b82f6", "#d4a017", "#db2777"];
  let index = 0;
  for (const char of code) index = (index + char.charCodeAt(0)) % palette.length;
  return palette[index];
}

function glyphKind(name: string) {
  const text = name.toLowerCase();
  if (text.includes("math")) return "math";
  if (text.includes("network")) return "network";
  if (text.includes("database") || text.includes("data")) return "data";
  if (text.includes("operating")) return "screen";
  if (text.includes("system") || text.includes("analysis")) return "nodes";
  return "grid";
}

function ModuleGlyph({ kind }: { kind: string }) {
  if (kind === "math") {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M5 16.5 9.2 7h1.7L15.2 16.5h-1.8l-.8-2.1H7.6l-.8 2.1H5Zm3.2-3.5h3.3L10 9.4 8.2 13Z" fill="currentColor" />
      </svg>
    );
  }
  if (kind === "network") {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M12 16.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4ZM7.2 8.2a6.8 6.8 0 0 1 9.6 0M9.1 11a4 4 0 0 1 5.8 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "data") {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <ellipse cx="12" cy="7" rx="6" ry="2.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M6 7v5c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4V7M6 12v5c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4v-5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (kind === "screen") {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <rect x="4" y="5" width="16" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 19h6M12 16v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "nodes") {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <circle cx="7" cy="8" r="2" fill="currentColor" />
        <circle cx="16.5" cy="7" r="2" fill="currentColor" />
        <circle cx="12" cy="16" r="2" fill="currentColor" />
        <path d="M8.7 9.2 10.6 14.2M14.8 8.6 13.2 14.2" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.5" fill="currentColor" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" fill="currentColor" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" fill="currentColor" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function labelStatus(status: string) {
  const text = status.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function pageWindow(page: number, pages: number) {
  if (pages <= 5) return Array.from({ length: pages }, (_, index) => index + 1);
  const start = Math.max(1, Math.min(page - 1, pages - 4));
  return Array.from({ length: 5 }, (_, index) => start + index);
}

export default function AdminCoursesPage() {
  const [items, setItems] = useState<AdminModule[]>([]);
  const [scope, setScope] = useState<AdminScope | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [view, setView] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(1);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function blankForm() {
    return { ...EMPTY };
  }

  async function refresh(q = query) {
    const result = await loadModules(q);
    if (result.ok) setItems(result.data);
    else setError(result.message);
  }

  useEffect(() => {
    loadScope().then((scopeResult) => {
      if (scopeResult.ok) setScope(scopeResult.data);
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refresh(query);
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuId]);

  const visible = useMemo(() => {
    return items.filter((item) => status === "ALL" || item.status === status);
  }, [items, status]);

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const slice = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const from = visible.length ? (safePage - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(safePage * PAGE_SIZE, visible.length);

  function openEditor(item: AdminModule) {
    setEditing(item.id);
    setMenuId(null);
    setForm({
      code: item.code,
      name: item.name,
      description: item.description,
      objectives: item.objectives.join("\n"),
      coverColor: item.coverColor ?? "",
      status: item.status,
      programmeId: item.programmeId ?? scope?.programmes[0]?.id ?? "",
    });
    document.getElementById("module-form")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const result = await saveModule(
      {
        code: form.code,
        name: form.name,
        description: form.description,
        objectives: form.objectives.split("\n").map((item) => item.trim()).filter(Boolean),
        coverColor: form.coverColor || null,
        status: form.status,
        programmeId: form.programmeId,
      },
      editing ?? undefined,
    );
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage(editing ? "Module updated." : "Module created.");
    setForm(blankForm());
    setEditing(null);
    refresh();
  }

  function focusCreate() {
    setEditing(null);
    setForm(blankForm());
    document.getElementById("module-form")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    window.setTimeout(() => document.getElementById("module-code")?.focus(), 250);
  }

  return (
    <AppShell
      variant="admin"
      title="Courses & Modules"
      subtitle={
        scope?.canManageCatalogue
          ? "Build and organize learning content. Create modules inside a program to structure your curriculum."
          : "You can edit lessons in the modules assigned to you. Module catalogue changes need a program administrator."
      }
      actions={
        scope?.canManageCatalogue ? (
          <button type="button" className="admin-create-btn" onClick={focusCreate}>
            <span aria-hidden="true">+</span> Create module
          </button>
        ) : undefined
      }
    >
      <div className={scope?.canManageCatalogue ? "admin-board" : "admin-board is-single"}>
        <section className="admin-panel">
          <div className="admin-toolbar">
            <label className="admin-search">
              <span className="sr-only">Search modules</span>
              <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M13.2 13.2 17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search by code or name..." />
            </label>
            <label className="admin-select">
              <span className="sr-only">Status</span>
              <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                <option value="ALL">All Status</option>
                <option value="PUBLISHED">Published</option>
                <option value="DRAFT">Draft</option>
                <option value="UNPUBLISHED">Unpublished</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            <div className="admin-view" role="group" aria-label="Layout">
              <button type="button" aria-pressed={view === "list"} className={view === "list" ? "is-on" : undefined} onClick={() => setView("list")}>
                <span className="sr-only">List</span>
                <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M4 5h12M4 10h12M4 15h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
              </button>
              <button type="button" aria-pressed={view === "grid"} className={view === "grid" ? "is-on" : undefined} onClick={() => setView("grid")}>
                <span className="sr-only">Grid</span>
                <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z" fill="currentColor" /></svg>
              </button>
            </div>
          </div>

          {error ? <p className="cms-error">{error}</p> : null}
          {message ? <p className="cms-ok">{message}</p> : null}

          {slice.length ? (
            <ul className={view === "grid" ? "admin-mods is-grid" : "admin-mods"}>
              {slice.map((item) => {
                const color = tintFor(item.code, item.coverColor);
                return (
                  <li key={item.id}>
                    <span className="admin-mod-mark" style={{ "--mark": color } as React.CSSProperties}>
                      <ModuleGlyph kind={glyphKind(`${item.code} ${item.name}`)} />
                    </span>
                    <div className="admin-mod-copy">
                      <strong>{item.code}</strong>
                      <span>{item.name}</span>
                      <em>{item.programmeName || "Unassigned program"}</em>
                    </div>
                    <span className={`admin-pill is-${item.status.toLowerCase()}`}>{labelStatus(item.status)}</span>
                    <span className="admin-mod-date">Created {formatDate(item.createdAt || item.updatedAt)}</span>
                    <span className="admin-mod-stat">
                      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M6 3.5h6l3 3V16a1.5 1.5 0 0 1-1.5 1.5h-7.5A1.5 1.5 0 0 1 4.5 16V5A1.5 1.5 0 0 1 6 3.5Z" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M12 3.5V7h3.5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
                      {item.chapterCount} {item.chapterCount === 1 ? "Chapter" : "Chapters"}
                    </span>
                    <span className="admin-mod-stat">
                      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M2.5 10S5.2 5.5 10 5.5 17.5 10 17.5 10 14.8 14.5 10 14.5 2.5 10 2.5 10Z" fill="none" stroke="currentColor" strokeWidth="1.4" /><circle cx="10" cy="10" r="2" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
                      {item.publishedLessons}/{item.lessonCount} Published lessons
                    </span>
                    <div className="admin-menu">
                      <button
                        type="button"
                        className="admin-manage"
                        aria-expanded={menuId === item.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          setMenuId((current) => (current === item.id ? null : item.id));
                        }}
                      >
                        Manage
                        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                      </button>
                      {menuId === item.id ? (
                        <div className="admin-pop" onClick={(event) => event.stopPropagation()}>
                          {scope?.canManageCatalogue ? (
                            <button type="button" onClick={() => openEditor(item)}>Edit module</button>
                          ) : null}
                          <Link href={`/admin/lessons?module=${item.id}`}>Chapters & lessons</Link>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="dash-empty">No modules match that search.</p>
          )}

          <footer className="admin-pager">
            <p>Showing {from} to {to} of {visible.length} modules</p>
            <div>
              <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} aria-label="Previous page">‹</button>
              {pageWindow(safePage, pages).map((number) => (
                <button key={number} type="button" className={number === safePage ? "is-on" : undefined} onClick={() => setPage(number)}>
                  {number}
                </button>
              ))}
              <button type="button" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)} aria-label="Next page">›</button>
            </div>
          </footer>
        </section>

        {scope?.canManageCatalogue ? (
          <form className="admin-create" id="module-form" onSubmit={onSubmit}>
            <header>
              <span className="admin-create-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20"><rect x="4" y="4" width="7" height="7" rx="1.6" /><rect x="13" y="4" width="7" height="7" rx="1.6" /><rect x="4" y="13" width="7" height="7" rx="1.6" /><rect x="13" y="13" width="7" height="7" rx="1.6" /></svg>
              </span>
              <div>
                <h2>{editing ? "Edit module" : "Create new module"}</h2>
                <p>{editing ? "Update this module’s catalogue details." : "Add a new module to a program."}</p>
              </div>
            </header>
            <label>
              Program <span>*</span>
              <select required value={form.programmeId} onChange={(event) => setForm({ ...form, programmeId: event.target.value })} disabled={Boolean(editing)}>
                <option value="">Select a program</option>
                {(scope.programmes ?? []).map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label>
              Module Code <span>*</span>
              <input id="module-code" required value={form.code} placeholder="e.g. IT300" onChange={(event) => setForm({ ...form, code: event.target.value })} />
            </label>
            <label>
              Module Name <span>*</span>
              <input required value={form.name} placeholder="e.g. Data Structures" onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label>
              Description
              <textarea value={form.description} placeholder="Brief description of the module..." onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </label>
            <label>
              Learning objectives (one per line)
              <textarea value={form.objectives} placeholder={"e.g. Understand arrays\nImplement linked lists"} onChange={(event) => setForm({ ...form, objectives: event.target.value })} />
            </label>
            <label>
              Cover colour
              <span className="admin-color">
                <input
                  type="color"
                  aria-label="Pick a cover colour"
                  value={/^#[0-9a-fA-F]{6}$/.test(form.coverColor) ? form.coverColor : "#7b61ff"}
                  onChange={(event) => setForm({ ...form, coverColor: event.target.value })}
                />
                <input value={form.coverColor} placeholder="#7B61FF" onChange={(event) => setForm({ ...form, coverColor: event.target.value })} />
              </span>
            </label>
            <label>
              Status
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="UNPUBLISHED">Unpublished</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            <button type="submit" className="admin-create-btn is-wide">
              {editing ? "Save module" : "Create module"}
            </button>
            {editing ? (
              <button type="button" className="admin-text-btn" onClick={() => { setEditing(null); setForm(blankForm()); }}>
                Cancel editing
              </button>
            ) : null}
          </form>
        ) : (
          <p className="dash-card cms-note">Content creators cannot add or rename modules. Open an assigned module to create lessons.</p>
        )}
      </div>
    </AppShell>
  );
}
