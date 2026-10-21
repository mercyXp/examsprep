"use client";

import { useEffect, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import AnnouncementForm from "../AnnouncementForm";
import { loadScope, type AdminScope } from "@/lib/cms";

export default function NewAnnouncementPage() {
  const [scope, setScope] = useState<AdminScope | null>(null);

  useEffect(() => {
    loadScope().then((result) => {
      if (result.ok) setScope(result.data);
    });
  }, []);

  return (
    <AppShell variant="admin" title="Create announcement" subtitle="Write a message for the students who should see it.">
      <div className="dash-body">
        <article className="dash-card">
          {scope ? <AnnouncementForm scope={scope} /> : <p className="dash-empty">Loading form…</p>}
        </article>
      </div>
    </AppShell>
  );
}
