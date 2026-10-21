"use client";

import { useEffect, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { loadStudent, loadStudents, setStudentStatus, type AdminStudent } from "@/lib/cms";

export default function AdminStudentsPage() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<AdminStudent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminStudent | null>(null);
  const [progress, setProgress] = useState<Array<{ title: string | null; moduleCode: string | null; completedAt: string | null }>>([]);
  const [error, setError] = useState("");

  async function refresh(nextPage = page, nextQuery = query) {
    const result = await loadStudents(nextQuery, nextPage);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError("");
    setItems(result.data.items ?? []);
    setTotal(result.data.total ?? 0);
    setPage(result.data.page ?? nextPage);
  }

  useEffect(() => {
    loadStudents("", 1).then((result) => {
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError("");
      setItems(result.data.items ?? []);
      setTotal(result.data.total ?? 0);
      setPage(result.data.page ?? 1);
    });
  }, []);

  async function openStudent(id: string) {
    const result = await loadStudent(id);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSelected(result.data.student);
    setProgress(result.data.progress ?? []);
  }

  return (
    <AppShell variant="admin" title="Students" subtitle="Search accounts, view progress, and change status.">
      <div className="dash-body cms-split">
        <div className="cms-stack">
          <form
            className="cms-search"
            onSubmit={(event) => {
              event.preventDefault();
              refresh(1, query);
            }}
          >
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" />
            <button type="submit" className="dash-primary">
              Search
            </button>
          </form>
          {error ? <p className="cms-error">{error}</p> : null}
          <ul className="cms-lessons">
            {items.map((item) => (
              <li key={item.id}>
                <button type="button" className="cms-plain" onClick={() => openStudent(item.id)}>
                  <strong>{item.name}</strong>
                  <span>
                    {item.email} · {item.status}
                  </span>
                </button>
                <span>
                  {item.lessonsCompleted}/{item.lessonsStarted || item.lessonsCompleted} lessons
                </span>
              </li>
            ))}
          </ul>
          {!items.length ? <p className="dash-empty">No students match that search.</p> : null}
          <p>
            Page {page} · {total} accounts
            {page * 20 < total ? (
              <button type="button" onClick={() => refresh(page + 1, query)}>
                Next
              </button>
            ) : null}
          </p>
        </div>
        <article className="dash-card">
          {selected ? (
            <>
              <h2>{selected.name}</h2>
              <p>{selected.email}</p>
              <p>
                {selected.programme || "No programme"} · Year {selected.yearOfStudy ?? "—"} · Semester {selected.semesterOfStudy ?? "—"}
              </p>
              <p>Modules: {selected.moduleCodes.join(", ") || "None selected"}</p>
              <p>Status: {selected.status}</p>
              <div className="cms-actions">
                {selected.status === "active" ? (
                  <button type="button" onClick={async () => {
                    await setStudentStatus(selected.id, "suspended");
                    await refresh();
                    openStudent(selected.id);
                  }}>
                    Deactivate
                  </button>
                ) : (
                  <button type="button" onClick={async () => {
                    await setStudentStatus(selected.id, "active");
                    await refresh();
                    openStudent(selected.id);
                  }}>
                    Activate
                  </button>
                )}
              </div>
              <h3>Lesson progress</h3>
              {progress.length ? (
                <ul className="cms-list">
                  {progress.map((item) => (
                    <li key={`${item.title}-${item.completedAt}`}>
                      {item.moduleCode} — {item.title} {item.completedAt ? "(completed)" : "(in progress)"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dash-empty">No lesson progress yet.</p>
              )}
            </>
          ) : (
            <p className="dash-empty">Select a student to view details.</p>
          )}
        </article>
      </div>
    </AppShell>
  );
}
