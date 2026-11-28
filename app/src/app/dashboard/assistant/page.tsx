"use client";

import { useEffect, useState } from "react";
import { VoiceTutor } from "@/app/components/assist/VoiceTutor";
import AppShell from "@/app/components/shell/AppShell";
import { loadExamSchedule, type StudentExamSchedule } from "@/lib/learn-api";
import { examSittingCaption, remainingLabel } from "@/lib/study";

export default function AssistantPage() {
  const [schedule, setSchedule] = useState<StudentExamSchedule | null>(null);

  useEffect(() => {
    loadExamSchedule().then((result) => {
      if (result.ok) setSchedule(result.data);
    });
  }, []);

  const upcoming = [...(schedule?.modules ?? [])].sort((left, right) => {
    const a = left.examDate || left.windowStart || "";
    const b = right.examDate || right.windowStart || "";
    return a.localeCompare(b);
  });

  return (
    <AppShell
      variant="student"
      title="Study Assistant"
      subtitle="Prioritise topics by the next actual examination sitting."
    >
      <div className="dash-body cms-stack">
        <VoiceTutor />
        <article className="dash-card">
          <header className="dash-card-head">
            <h2>Revision order</h2>
            <span>{schedule?.period?.name || "Waiting for timetable"}</span>
          </header>
          <p>
            The voice tutor above uses your selected course. This list is the published examination order when a
            timetable exists.
          </p>
          {upcoming.length ? (
            <ol className="dash-time-mods">
              {upcoming.map((item) => (
                <li key={item.code}>
                  <p>
                    <strong>
                      {item.code} — {item.name}
                    </strong>
                  </p>
                  <small>
                    {examSittingCaption(item)} · {remainingLabel(item.examDate || (item.official ? item.windowStart : null))}
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="dash-empty">Your examination dates will appear here after they are published.</p>
          )}
        </article>
      </div>
    </AppShell>
  );
}
