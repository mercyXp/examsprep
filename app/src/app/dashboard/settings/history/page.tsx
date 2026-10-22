"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { loadLearningHistory, type HistoryCourse } from "@/lib/learn-api";

export default function LearningHistoryPage() {
  const [items, setItems] = useState<HistoryCourse[]>([]);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadLearningHistory().then((result) => {
      if (result.ok) setItems(result.data);
      else setError(result.message);
      setReady(true);
    });
  }, []);

  return (
    <AppShell
      variant="student"
      title="My learning history"
      subtitle="Modules you removed stay here. Lesson progress is kept."
    >
      <div className="dash-body cms-stack">
        <p>
          <Link href="/dashboard/settings">Back to settings</Link>
        </p>
        {error ? <p className="cms-error">{error}</p> : null}
        {ready && !items.length ? <p className="dash-empty">You have not removed any modules yet.</p> : null}
        <ul className="course-list">
          {items.map((item) => (
            <li key={item.id}>
              <div>
                <strong>
                  {item.code} — {item.name}
                </strong>
                <span>
                  {item.yearNumber ? `Year ${item.yearNumber}` : "Year"} ·{" "}
                  {item.semesterNumber ? `Semester ${item.semesterNumber}` : "Semester"} · {item.completedLessons} of{" "}
                  {item.totalLessons} lessons
                </span>
              </div>
              <Link href={`/dashboard/courses/${item.id}`}>Open</Link>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
