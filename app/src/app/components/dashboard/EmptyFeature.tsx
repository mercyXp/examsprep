"use client";

import AppShell from "@/app/components/shell/AppShell";

export default function EmptyFeature({
  title,
  summary,
  detail,
}: {
  title: string;
  summary: string;
  detail: string;
}) {
  return (
    <AppShell variant="student" title={title} subtitle={summary}>
      <div className="dash-body">
        <article className="dash-card">
          <p>{detail}</p>
        </article>
      </div>
    </AppShell>
  );
}
