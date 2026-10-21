"use client";

import AppShell from "@/app/components/shell/AppShell";

export default function AdminQuizzesPage() {
  return (
    <AppShell variant="admin" title="Quizzes & Mock Exams" subtitle="Create a quiz once the question bank is connected.">
      <article className="dash-card">
        <p>No quizzes are stored yet. Use lesson knowledge checks until mock exams are published from this page.</p>
      </article>
    </AppShell>
  );
}
