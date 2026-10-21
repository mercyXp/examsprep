"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { loadModules, loadScope, saveModule, type AdminModule, type AdminScope } from "@/lib/cms";

const empty = { code: "", name: "", description: "", objectives: "", coverColor: "", status: "PUBLISHED", programmeId: "" };

export default function AdminCoursesPage() {
  const [items, setItems] = useState<AdminModule[]>([]);
  const [scope, setScope] = useState<AdminScope | null>(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh(q = query) {
    const result = await loadModules(q);
    if (result.ok) setItems(result.data);
    else setError(result.message);
  }

  useEffect(() => {
    Promise.all([loadModules(""), loadScope()]).then(([result, scopeResult]) => {
      if (result.ok) setItems(result.data);
      else setError(result.message);
      if (scopeResult.ok) {
        setScope(scopeResult.data);
        if (!form.programmeId && scopeResult.data.programmes[0]) {
          setForm((current) => ({ ...current, programmeId: scopeResult.data.programmes[0].id }));
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setForm({ ...empty, programmeId: scope?.programmes[0]?.id ?? "" });
    setEditing(null);
    refresh();
  }

  return (
    <AppShell
      variant="admin"
      title="Courses & Modules"
      subtitle={
        scope?.canManageCatalogue
          ? "Create modules inside a program. The same code can exist in another program as a separate record."
          : "You can edit lessons in the modules assigned to you. Module catalogue changes need a program administrator."
      }
    >
      <div className="dash-body cms-split">
        <div className="cms-stack">
          <form
            className="cms-search"
            onSubmit={(event) => {
              event.preventDefault();
              refresh(query);
            }}
          >
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code or name" />
            <button type="submit">Search</button>
          </form>
          {error ? <p className="cms-error">{error}</p> : null}
          {message ? <p className="cms-ok">{message}</p> : null}
          <ul className="cms-lessons">
            {items.map((item) => (
              <li key={item.id}>
                <div>
                  <h3>
                    {item.code} — {item.name}
                  </h3>
                  <p>
                    {item.programmeName || "Unassigned program"} · {item.status} · {item.chapterCount} chapters · {item.publishedLessons}/{item.lessonCount} published lessons
                  </p>
                </div>
                <div className="cms-actions">
                  {scope?.canManageCatalogue ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(item.id);
                        setForm({
                          code: item.code,
                          name: item.name,
                          description: item.description,
                          objectives: item.objectives.join("\n"),
                          coverColor: item.coverColor ?? "",
                          status: item.status,
                          programmeId: item.programmeId ?? scope?.programmes[0]?.id ?? "",
                        });
                      }}
                    >
                      Edit
                    </button>
                  ) : null}
                  <Link href={`/admin/lessons?module=${item.id}`}>Chapters</Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
        {scope?.canManageCatalogue ? (
        <form className="dash-card cms-form" onSubmit={onSubmit}>
          <h2>{editing ? "Edit module" : "Create module"}</h2>
          <label>
            Program
            <select
              required
              value={form.programmeId}
              onChange={(event) => setForm({ ...form, programmeId: event.target.value })}
              disabled={Boolean(editing)}
            >
              <option value="">Select a program</option>
              {(scope?.programmes ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Code
            <input required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
          </label>
          <label>
            Name
            <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label>
            Description
            <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </label>
          <label>
            Learning objectives (one per line)
            <textarea value={form.objectives} onChange={(event) => setForm({ ...form, objectives: event.target.value })} />
          </label>
          <label>
            Cover colour
            <input value={form.coverColor} onChange={(event) => setForm({ ...form, coverColor: event.target.value })} placeholder="#3444da" />
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
          <div className="cms-actions">
            <button type="submit" className="dash-primary">
              {editing ? "Save module" : "Create module"}
            </button>
            {editing ? (
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setForm(empty);
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
        ) : (
          <p className="dash-card cms-note">Content creators cannot add or rename modules. Open an assigned module to create lessons.</p>
        )}
      </div>
    </AppShell>
  );
}
