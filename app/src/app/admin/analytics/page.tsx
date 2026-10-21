"use client";

import { useEffect, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { loadOverview, type AdminStats } from "@/lib/cms";

export default function AdminAnalyticsPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  useEffect(() => {
    loadOverview().then((result) => {
      if (result.ok) setStats(result.data.stats);
    });
  }, []);
  return (
    <AppShell variant="admin" title="Analytics & Reports" subtitle="Counts from live records, not estimates.">
      <article className="dash-card">
        {stats ? (
          <ul className="cms-list">
            <li>{stats.totalStudents} registered students</li>
            <li>{stats.activeStudents} active accounts</li>
            <li>{stats.publishedLessons} published lessons</li>
            <li>{stats.totalQuizzes} quizzes</li>
          </ul>
        ) : (
          <p className="dash-empty">Loading analytics…</p>
        )}
      </article>
    </AppShell>
  );
}
