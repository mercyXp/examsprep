"use client";

import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import AnnouncementForm from "../AnnouncementForm";
import { loadAnnouncement, loadScope, type AdminScope, type AnnouncementRow } from "@/lib/cms";

function EditAnnouncementPage() {
  const params = useParams<{ id: string }>();
  const [scope, setScope] = useState<AdminScope | null>(null);
  const [item, setItem] = useState<AnnouncementRow | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([loadScope(), loadAnnouncement(params.id)]).then(([scopeResult, result]) => {
      if (scopeResult.ok) setScope(scopeResult.data);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setItem(result.data.item);
    });
  }, [params.id]);

  return (
    <AppShell variant="admin" title="Edit announcement" subtitle="Update, schedule, or publish this message.">
      <div className="dash-body">
        <article className="dash-card">
          {error ? <p className="cms-error">{error}</p> : null}
          {item && scope ? <AnnouncementForm scope={scope} item={item} /> : error ? null : <p className="dash-empty">Loading announcement…</p>}
        </article>
      </div>
    </AppShell>
  );
}

export default function EditAnnouncementRoute() {
  return (
    <Suspense fallback={<p className="dash-empty">Loading announcement…</p>}>
      <EditAnnouncementPage />
    </Suspense>
  );
}
