"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { loadProgrammes, selectProgramme, type StudyProgramme } from "@/lib/learn-api";

export default function ProgrammesPage() {
  const [items, setItems] = useState<StudyProgramme[]>([]);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    loadProgrammes().then((result) => {
      if (result.ok) setItems(result.data);
      else setError(result.message);
      setReady(true);
    });
  }, []);

  async function choose(programme: StudyProgramme) {
    setBusy(programme.id);
    setError("");
    const result = await selectProgramme(programme.name);
    setBusy("");
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setItems((current) => current.map((item) => ({ ...item, selected: item.id === programme.id })));
  }

  return (
    <AppShell
      variant="student"
      title="Programmes"
      subtitle="Choose the programme you are studying. Courses from that programme can then be added to your plan."
    >
      <div className="dash-body cms-stack">
        {!ready ? <p className="dash-empty">Loading programmes…</p> : null}
        {error ? <p className="cms-error">{error}</p> : null}
        <ul className="cms-grid">
          {items.map((programme) => (
            <li key={programme.id} className="dash-card">
              <p className="dash-kicker">
                {programme.category}
                {programme.durationYears ? ` · ${programme.durationYears} years` : ""}
              </p>
              <h2>{programme.name}</h2>
              <p>{programme.blurb || "Programme details will appear here."}</p>
              <p className="cms-muted">{programme.selectable ? "Open for study" : "Coming soon"}</p>
              <div className="cms-actions">
                {programme.selected ? (
                  <Link className="dash-primary" href="/dashboard/courses">
                    View courses
                  </Link>
                ) : (
                  <button type="button" className="dash-primary" disabled={!programme.selectable || busy === programme.id} onClick={() => choose(programme)}>
                    {busy === programme.id ? "Saving…" : programme.selectable ? "Select programme" : "Not open yet"}
                  </button>
                )}
                {programme.selected ? <Link href="/dashboard/settings/courses">Choose modules</Link> : null}
              </div>
            </li>
          ))}
        </ul>
        {ready && !items.length ? <p className="dash-empty">No programmes are published yet.</p> : null}
      </div>
    </AppShell>
  );
}
