"use client";

import AppShell from "@/app/components/shell/AppShell";

export default function AdminQuestionsPage() {
  return (
    <AppShell variant="admin" title="Question Bank" subtitle="Standalone quiz items are not authored here yet.">
      <article className="dash-card">
        <p>Knowledge checks live inside lessons for now. A shared question bank will list reusable items when that workflow is added.</p>
      </article>
    </AppShell>
  );
}
