"use client";

import { useEffect, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { loadScope, loadStudent, loadStudents, setStudentStatus, type AdminScope, type AdminStudent, type StudentSummary } from "@/lib/cms";

const PAGE_SIZE = 10;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EMPTY_SUMMARY: StudentSummary = { total: 0, active: 0, withProgress: 0, completedLessons: 0 };

function formatDate(iso: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!match) return "—";
  return `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}

function lastLoginLabel(iso: string | null | undefined, now: number | null) {
  if (!iso) return { when: "Never", ago: "No sign-in yet", recent: false };
  if (now == null) return { when: formatDate(iso), ago: "", recent: false };
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return { when: "—", ago: "", recent: false };
  const date = new Date(then);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const startOf = (value: number) => {
    const day = new Date(value);
    day.setHours(0, 0, 0, 0);
    return day.getTime();
  };
  const dayGap = Math.round((startOf(now) - startOf(then)) / 86_400_000);
  const when = dayGap === 0 ? `Today, ${time}` : dayGap === 1 ? `Yesterday, ${time}` : `${formatDate(iso)}, ${time}`;
  const minutes = Math.max(0, Math.round((now - then) / 60_000));
  let ago = "";
  if (minutes < 1) ago = "Just now";
  else if (minutes < 60) ago = `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  else if (minutes < 60 * 24) {
    const hours = Math.round(minutes / 60);
    ago = `${hours} hour${hours === 1 ? "" : "s"} ago`;
  } else if (dayGap === 1) ago = "1 day ago";
  else if (dayGap > 1) ago = `${dayGap} days ago`;
  return { when, ago, recent: minutes < 60 * 24 };
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "ST";
}

function tint(name: string) {
  const palette = ["#7c5cfc", "#1f9d62", "#e07a2f", "#3b82f6", "#d4a017", "#db2777", "#0f766e"];
  let index = 0;
  for (const char of name) index = (index + char.charCodeAt(0)) % palette.length;
  return palette[index];
}

function pageWindow(page: number, pages: number) {
  if (pages <= 5) return Array.from({ length: pages }, (_, index) => index + 1);
  const start = Math.max(1, Math.min(page - 1, pages - 4));
  return Array.from({ length: 5 }, (_, index) => start + index);
}

export default function AdminStudentsPage() {
  const [scope, setScope] = useState<AdminScope | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [programme, setProgramme] = useState("");
  const [items, setItems] = useState<AdminStudent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<StudentSummary>(EMPTY_SUMMARY);
  const [selected, setSelected] = useState<AdminStudent | null>(null);
  const [progress, setProgress] = useState<Array<{ title: string | null; moduleCode: string | null; completedAt: string | null }>>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState<number | null>(null);

  async function refresh(nextPage = page, nextQuery = query, nextStatus = status, nextProgramme = programme) {
    const result = await loadStudents(nextQuery, nextPage, {
      status: nextStatus,
      programme: nextProgramme,
      pageSize: PAGE_SIZE,
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError("");
    setItems(result.data.items ?? []);
    setTotal(result.data.total ?? 0);
    setPage(result.data.page ?? nextPage);
    if (result.data.summary) setSummary(result.data.summary);
  }

  useEffect(() => {
    loadScope().then((result) => {
      if (result.ok) setScope(result.data);
    });
    setNow(Date.now());
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refresh(1, query, status, programme);
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, status, programme]);

  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuId]);

  async function openStudent(item: AdminStudent) {
    setMenuId(null);
    const result = await loadStudent(item.id);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSelected({ ...item, ...result.data.student });
    setProgress(result.data.progress ?? []);
  }

  async function changeStatus(item: AdminStudent, next: "active" | "suspended") {
    setMenuId(null);
    const result = await setStudentStatus(item.id, next);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    await refresh();
    if (selected?.id === item.id) openStudent({ ...item, status: next });
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(page * PAGE_SIZE, total);
  const programmes = scope?.programmes ?? [];

  return (
    <AppShell
      variant="admin"
      title="Students"
      subtitle="Manage your learners, track their progress, and keep everyone on the right path."
    >
      <div className="admin-students">
        <section className="admin-kpis" aria-label="Student totals">
          <article>
            <span className="is-violet" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22"><circle cx="9" cy="9" r="3" fill="none" stroke="currentColor" strokeWidth="1.7" /><circle cx="16" cy="10" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M4.5 18c.6-2.4 2.4-3.6 4.5-3.6s3.9 1.2 4.5 3.6M14 14.6c1.3-.4 2.6-.2 3.8.8 1 .8 1.6 1.8 1.8 2.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            </span>
            <div>
              <strong>{summary.total}</strong>
              <b>Total Students</b>
              <em>All registered learners</em>
            </div>
          </article>
          <article>
            <span className="is-green" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M8.5 12.2 11 14.6 15.6 9.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            </span>
            <div>
              <strong>{summary.active}</strong>
              <b>Active Students</b>
              <em>Engaged and learning</em>
            </div>
          </article>
          <article>
            <span className="is-amber" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 16.5 9 8l3 5 2-3 5 6.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <div>
              <strong>{summary.withProgress}</strong>
              <b>Students with Progress</b>
              <em>Have started a lesson</em>
            </div>
          </article>
          <article>
            <span className="is-blue" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 10.5 12 6l7 4.5-7 4.5-7-4.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M8 12.2V16c1.2.8 2.6 1.2 4 1.2s2.8-.4 4-1.2v-3.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            </span>
            <div>
              <strong>{summary.completedLessons}</strong>
              <b>Finished a lesson</b>
              <em>Have completed at least one</em>
            </div>
          </article>
        </section>

        <section className="admin-panel">
          <div className="admin-toolbar">
            <label className="admin-search">
              <span className="sr-only">Search students</span>
              <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M13.2 13.2 17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or email..." />
            </label>
            <label className="admin-select">
              <span className="sr-only">Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
            <label className="admin-select">
              <span className="sr-only">Programme</span>
              <select value={programme} onChange={(event) => setProgramme(event.target.value)}>
                <option value="">All Programmes</option>
                {programmes.map((item) => (
                  <option key={item.id} value={item.name}>{item.name}</option>
                ))}
              </select>
            </label>
          </div>

          {error ? <p className="cms-error">{error}</p> : null}

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Status</th>
                  <th>Lessons</th>
                  <th>Programme</th>
                  <th>Last login</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const lessons = Math.max(item.lessonsStarted, item.lessonsCompleted);
                  const percent = lessons ? Math.round((item.lessonsCompleted / lessons) * 100) : 0;
                  return (
                    <tr key={item.id}>
                      <td>
                        <span className="admin-person">
                          <span className="admin-avatar" style={{ "--mark": tint(item.name) } as React.CSSProperties}>{initials(item.name)}</span>
                          <span>
                            <strong>{item.name}</strong>
                            <em>{item.email}</em>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className={`admin-status is-${item.status.toLowerCase()}`}>
                          <i />
                          {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                        </span>
                      </td>
                      <td>
                        <span className="admin-progress">
                          <span><i style={{ width: `${percent}%` }} /></span>
                          {item.lessonsCompleted} / {lessons} lessons
                        </span>
                      </td>
                      <td>{item.programme || "—"}</td>
                      <td>
                        {(() => {
                          const login = lastLoginLabel(item.lastLoginAt, now);
                          return (
                            <span className={login.recent ? "admin-login is-recent" : "admin-login"}>
                              <strong>{login.when}</strong>
                              {login.ago ? <em>{login.ago}</em> : null}
                            </span>
                          );
                        })()}
                      </td>
                      <td>{formatDate(item.createdAt)}</td>
                      <td>
                        <div className="admin-menu">
                          <button
                            type="button"
                            className="admin-kebab"
                            aria-label={`Actions for ${item.name}`}
                            aria-expanded={menuId === item.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              setMenuId((current) => (current === item.id ? null : item.id));
                            }}
                          >
                            ···
                          </button>
                          {menuId === item.id ? (
                            <div className="admin-pop" onClick={(event) => event.stopPropagation()}>
                              <button type="button" onClick={() => openStudent(item)}>View progress</button>
                              {item.status === "active" ? (
                                <button type="button" onClick={() => changeStatus(item, "suspended")}>Suspend</button>
                              ) : (
                                <button type="button" onClick={() => changeStatus(item, "active")}>Activate</button>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!items.length ? <p className="dash-empty">No students match that search.</p> : null}
          </div>

          <footer className="admin-pager">
            <p>Showing {from} to {to} of {total} students</p>
            <div>
              <button type="button" disabled={page <= 1} onClick={() => refresh(page - 1)} aria-label="Previous page">‹</button>
              {pageWindow(page, pages).map((number) => (
                <button key={number} type="button" className={number === page ? "is-on" : undefined} onClick={() => refresh(number)}>
                  {number}
                </button>
              ))}
              <button type="button" disabled={page >= pages} onClick={() => refresh(page + 1)} aria-label="Next page">›</button>
            </div>
          </footer>
        </section>
      </div>

      {selected ? (
        <div className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="student-dialog-title">
          <button type="button" className="admin-dialog-scrim" aria-label="Close student details" onClick={() => setSelected(null)} />
          <article>
            <header>
              <div>
                <h2 id="student-dialog-title">{selected.name}</h2>
                <p>{selected.email}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close">×</button>
            </header>
            <p>
              {selected.programme || "No programme"} · Year {selected.yearOfStudy ?? "—"} · Semester {selected.semesterOfStudy ?? "—"}
            </p>
            <p>Modules: {selected.moduleCodes.join(", ") || "None selected"}</p>
            <p>
              Last login {lastLoginLabel(selected.lastLoginAt, now).when} · Joined {formatDate(selected.createdAt)} · Status {selected.status}
            </p>
            <div className="cms-actions">
              {selected.status === "active" ? (
                <button type="button" onClick={() => changeStatus(selected, "suspended")}>Suspend</button>
              ) : (
                <button type="button" onClick={() => changeStatus(selected, "active")}>Activate</button>
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
          </article>
        </div>
      ) : null}
    </AppShell>
  );
}
