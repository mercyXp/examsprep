"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { loadAnnouncements, loadScope, type AnnouncementRow, type AdminScope } from "@/lib/cms";

function MegaphoneIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 10v2a2 2 0 0 0 2 2h1l8 4V6L7 10H6a2 2 0 0 0-2 2Zm14-2.5v9M8 14.5V18a2 2 0 0 0 2 2h.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function statusClass(status: string) {
  if (status === "published") return "is-live";
  if (status === "scheduled") return "";
  return "is-muted";
}

export default function AdminAnnouncementsPage() {
  const [scope, setScope] = useState<AdminScope | null>(null);
  const [items, setItems] = useState<AnnouncementRow[]>([]);
  const [stats, setStats] = useState({ total: 0, published: 0, drafts: 0, scheduled: 0 });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function refresh(nextQuery = query, nextStatus = status) {
    const result = await loadAnnouncements(nextQuery, nextStatus);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError("");
    setItems(result.data.items ?? []);
    setStats(result.data.stats ?? { total: 0, published: 0, drafts: 0, scheduled: 0 });
  }

  useEffect(() => {
    Promise.all([loadScope(), loadAnnouncements()]).then(([scopeResult, result]) => {
      if (scopeResult.ok) setScope(scopeResult.data);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setItems(result.data.items ?? []);
      setStats(result.data.stats ?? { total: 0, published: 0, drafts: 0, scheduled: 0 });
    });
  }, []);

  const allowed = Boolean(scope?.canAnnounce);
  const shown = useMemo(() => items, [items]);

  return (
    <AppShell
      variant="admin"
      title="Announcements"
      subtitle="Share important updates with your students."
      actions={
        allowed ? (
          <Link href="/admin/announcements/new" className="dash-primary">
            + Create announcement
          </Link>
        ) : null
      }
    >
      <div className="dash-body announce-page">
        {!allowed ? (
          <article className="dash-card">
            <p>Content creators do not publish announcements. Use Courses and Lessons for learning content.</p>
          </article>
        ) : (
          <article className="dash-card announce-panel">
            {error ? <p className="cms-error">{error}</p> : null}
            <div className="announce-stats">
              <div>
                <span>Total announcements</span>
                <strong>{stats.total}</strong>
              </div>
              <div>
                <span>Published</span>
                <strong>{stats.published}</strong>
              </div>
              <div>
                <span>Drafts</span>
                <strong>{stats.drafts}</strong>
              </div>
              <div>
                <span>Scheduled</span>
                <strong>{stats.scheduled}</strong>
              </div>
            </div>

            <div className="announce-list-head">
              <h2>Announcement list</h2>
              <form
                className="announce-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  void refresh();
                }}
              >
                <label>
                  <span className="sr-only">Search by title or content</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search by title or content"
                  />
                </label>
                <select
                  value={status}
                  aria-label="Filter"
                  onChange={(event) => {
                    const next = event.target.value;
                    setStatus(next);
                    void refresh(query, next);
                  }}
                >
                  <option value="">Filter</option>
                  <option value="published">Published</option>
                  <option value="draft">Drafts</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="expired">Expired</option>
                </select>
              </form>
            </div>

            {shown.length ? (
              <ul className="announce-list">
                {shown.map((item) => (
                  <li key={item.id}>
                    <Link href={`/admin/announcements/${item.id}`}>
                      <p>
                        <strong>{item.title}</strong>
                        <span className={`settings-chip${statusClass(item.effectiveStatus)}`}>
                          {item.effectiveStatus}
                        </span>
                      </p>
                      <small>
                        {item.kindLabel} · {item.priorityLabel} · {item.audienceLabel}
                        {item.publishAt ? ` · ${item.publishAt}` : ""}
                      </small>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="announce-empty">
                <MegaphoneIcon />
                <h3>No announcements yet</h3>
                <p>Create your first announcement to share important updates with the students who need to see them.</p>
              </div>
            )}
          </article>
        )}
      </div>
    </AppShell>
  );
}
