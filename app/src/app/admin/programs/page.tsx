"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import {
  archiveProgramme,
  loadProgrammes,
  loadScope,
  saveProgramme,
  type AdminProgramme,
  type AdminScope,
} from "@/lib/cms";

const EMPTY = { name: "", category: "General", status: "available", durationYears: "4", blurb: "" };

const STATUS_LABELS: Record<string, string> = {
  available: "Available",
  coming_soon: "Coming soon",
  preview: "Preview",
  archived: "Archived",
};

function labelStatus(status: string) {
  return STATUS_LABELS[status] ?? status;
}

export default function ProgramsPage() {
  const [scope, setScope] = useState<AdminScope | null>(null);
  const [items, setItems] = useState<AdminProgramme[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canManage = Boolean(scope?.canManageProgrammes);
  const canView = canManage || Boolean(scope?.role === "administrator" || scope?.roles?.includes("administrator"));

  async function refresh() {
    const result = await loadProgrammes();
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setItems(result.data.items);
  }

  useEffect(() => {
    loadScope().then((result) => {
      if (result.ok) setScope(result.data);
    });
    loadProgrammes().then((result) => {
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setItems(result.data.items);
    });
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      [item.name, item.category, item.slug, labelStatus(item.status)].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [items, query]);

  function openEditor(item: AdminProgramme) {
    setEditing(item.id);
    setForm({
      name: item.name,
      category: item.category,
      status: item.status,
      durationYears: String(item.durationYears ?? 4),
      blurb: item.blurb,
    });
    document.getElementById("program-form")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const result = await saveProgramme(
      {
        name: form.name,
        category: form.category,
        status: form.status,
        durationYears: Number(form.durationYears) || 1,
        blurb: form.blurb,
      },
      editing ?? undefined,
    );
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage(editing ? "Program updated." : "Program created.");
    setForm(EMPTY);
    setEditing(null);
    refresh();
  }

  async function onArchive(item: AdminProgramme) {
    if (!window.confirm(`Archive ${item.name}? Modules stay in place, and it leaves the create-module list.`)) return;
    setError("");
    const result = await archiveProgramme(item.id);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage(`${item.name} archived.`);
    if (editing === item.id) {
      setEditing(null);
      setForm(EMPTY);
    }
    refresh();
  }

  async function onRestore(item: AdminProgramme) {
    setError("");
    const result = await saveProgramme(
      {
        name: item.name,
        category: item.category,
        status: "available",
        durationYears: item.durationYears ?? 4,
        blurb: item.blurb,
      },
      item.id,
    );
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage(`${item.name} restored.`);
    refresh();
  }

  return (
    <AppShell
      variant="admin"
      title="Programs"
      subtitle={
        canManage
          ? "Create the programs that modules belong to. Archive a program when it should leave the catalogue."
          : "Programs assigned to you. A super administrator creates and archives them."
      }
    >
      {!scope ? (
        <p className="dash-empty">Loading programs…</p>
      ) : !canView ? (
        <p className="dash-card cms-note">Only a super administrator or a program administrator can view programs.</p>
      ) : (
        <div className={canManage ? "admin-board" : "admin-board is-single"}>
          <section className="admin-panel">
            <div className="admin-toolbar">
              <label className="admin-search">
                <span className="sr-only">Search programs</span>
                <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                  <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M13.2 13.2 17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or category..." />
              </label>
            </div>
            {error ? <p className="cms-error">{error}</p> : null}
            {message ? <p className="cms-ok">{message}</p> : null}
            {visible.length ? (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Program</th>
                      <th>Category</th>
                      <th>Status</th>
                      <th>Years</th>
                      <th>Modules</th>
                      {canManage ? <th>Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.name}</strong>
                          <div className="admin-note">{item.slug}</div>
                        </td>
                        <td>{item.category}</td>
                        <td>
                          <span className={`admin-pill is-${item.status}`}>{labelStatus(item.status)}</span>
                        </td>
                        <td>{item.durationYears ?? "—"}</td>
                        <td>{item.moduleCount}</td>
                        {canManage ? (
                          <td>
                            <button type="button" className="admin-text-btn" onClick={() => openEditor(item)}>
                              Edit
                            </button>
                            {item.status === "archived" ? (
                              <button type="button" className="admin-text-btn" onClick={() => onRestore(item)}>
                                Restore
                              </button>
                            ) : (
                              <button type="button" className="admin-text-btn" onClick={() => onArchive(item)}>
                                Archive
                              </button>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="dash-empty">{query ? "No programs match that search." : "No programs yet."}</p>
            )}
          </section>

          {canManage ? (
            <form className="admin-create" id="program-form" onSubmit={onSubmit}>
              <header>
                <span className="admin-create-mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="20" height="20">
                    <path d="M4 20V9l8-5 8 5v11" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M9 20v-6h6v6" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  </svg>
                </span>
                <div>
                  <h2>{editing ? "Edit program" : "Create new program"}</h2>
                  <p>{editing ? "Update the catalogue details." : "Modules can be added as soon as this is saved."}</p>
                </div>
              </header>
              <label>
                Name <span>*</span>
                <input required value={form.name} placeholder="e.g. Bachelor of Science in Computing" onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </label>
              <label>
                Category
                <input value={form.category} placeholder="e.g. Computing & Technology" onChange={(event) => setForm({ ...form, category: event.target.value })} />
              </label>
              <label>
                Status
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                  <option value="available">Available</option>
                  <option value="coming_soon">Coming soon</option>
                  <option value="preview">Preview</option>
                  {editing ? <option value="archived">Archived</option> : null}
                </select>
              </label>
              <label>
                Duration (years)
                <select value={form.durationYears} onChange={(event) => setForm({ ...form, durationYears: event.target.value })}>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>
              </label>
              <label>
                Description
                <textarea value={form.blurb} placeholder="What students study in this program..." onChange={(event) => setForm({ ...form, blurb: event.target.value })} />
              </label>
              <button type="submit" className="admin-create-btn is-wide">
                {editing ? "Save program" : "Create program"}
              </button>
              {editing ? (
                <button
                  type="button"
                  className="admin-text-btn"
                  onClick={() => {
                    setEditing(null);
                    setForm(EMPTY);
                  }}
                >
                  Cancel editing
                </button>
              ) : null}
            </form>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
