"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { loadOverview, loadScope, type AdminLesson, type AdminScope, type AdminStats } from "@/lib/cms";

export default function AdminHomePage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recent, setRecent] = useState<AdminLesson[]>([]);
  const [scope, setScope] = useState<AdminScope | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([loadOverview(), loadScope()]).then(([result, scopeResult]) => {
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setStats(result.data.stats);
      setRecent(result.data.recentLessons ?? result.data.recentActivity ?? []);
      if (scopeResult.ok) setScope(scopeResult.data);
    });
  }, []);

  return (
    <AppShell
      variant="admin"
      title={scope?.role === "creator" ? "Content creator dashboard" : scope?.role === "administrator" ? "Program administrator dashboard" : "Admin dashboard"}
      subtitle={
        scope?.role === "creator"
          ? `Only assigned modules are listed: ${scope.modules.map((item) => item.code).join(", ") || "none yet"}.`
          : scope?.role === "administrator"
            ? `Managing ${scope.programmes.map((item) => item.name).join(", ") || "no assigned programs"}.`
            : "System-wide programs, modules, users, and content."
      }
    >
      <div className="dash-body cms-stack">
        {error ? <p className="cms-error">{error}</p> : null}
        <section className="dash-stats">
          <article className="dash-stat">
            <header>
              <span>Students</span>
            </header>
            <strong>{stats ? stats.totalStudents : "—"}</strong>
            <p>{stats ? `${stats.activeStudents} active` : "Loading…"}</p>
          </article>
          <article className="dash-stat">
            <header>
              <span>Modules</span>
            </header>
            <strong>{stats ? stats.totalModules : "—"}</strong>
            <p>Catalogue records</p>
          </article>
          <article className="dash-stat">
            <header>
              <span>Published lessons</span>
            </header>
            <strong>{stats ? stats.publishedLessons : "—"}</strong>
            <p>Visible to students</p>
          </article>
          <article className="dash-stat">
            <header>
              <span>Quizzes</span>
            </header>
            <strong>{stats ? stats.totalQuizzes : "—"}</strong>
            <p>Including unpublished</p>
          </article>
        </section>
        <article className="dash-card">
          <header className="dash-card-head">
            <h2>Quick actions</h2>
          </header>
          <div className="cms-actions">
            {scope?.canManageCatalogue ? (
              <Link className="dash-primary" href="/admin/courses">
                Create a course
              </Link>
            ) : (
              <Link className="dash-primary" href="/admin/lessons">
                Create a lesson
              </Link>
            )}
            <Link href="/admin/lessons">Manage chapters</Link>
            {scope?.canAssignCreators || scope?.canAssignAdmins ? <Link href="/admin/assignments">Assignments</Link> : null}
            <Link href="/admin/quizzes">Quizzes</Link>
          </div>
        </article>
        <article className="dash-card">
          <header className="dash-card-head">
            <h2>Recently updated lessons</h2>
          </header>
          {recent.length ? (
            <ul className="cms-lessons">
              {recent.map((item) => (
                <li key={item.id}>
                  <div>
                    <h3>{item.title}</h3>
                    <p>
                      {item.moduleCode} · {item.status}
                    </p>
                  </div>
                  <Link href={`/admin/lessons/${item.id}/edit`}>Edit</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dash-empty">No lessons have been updated yet.</p>
          )}
        </article>
      </div>
    </AppShell>
  );
}
