"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { loadCourses, type CourseSummary } from "@/lib/learn-api";

export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadCourses().then((result) => {
      if (result.ok) setCourses(result.data);
      else setError(result.message);
      setReady(true);
    });
  }, []);

  const shown = courses.filter((item) => `${item.code} ${item.name}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <AppShell variant="student" title="My Courses" subtitle="These are the modules you chose to study. Manage them in Settings.">
      <div className="dash-body cms-stack">
        <label className="dash-search">
          <span className="sr-only">Search courses</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search modules…" />
        </label>
        {!ready ? <p className="dash-empty">Loading courses…</p> : null}
        {error ? <p className="cms-error">{error}</p> : null}
        {ready && !shown.length ? <p className="dash-empty">No published modules are available yet.</p> : null}
        <ul className="cms-grid">
          {shown.map((course) => (
            <li key={course.id} className="dash-card">
              <p className="dash-kicker">
                {course.code}
                {course.yearNumber && course.semesterNumber
                  ? ` · Year ${course.yearNumber} · Semester ${course.semesterNumber}`
                  : ""}
              </p>
              <h2>{course.name}</h2>
              <p>{course.description || "No description yet."}</p>
              <div className="dash-bar" aria-label={`${course.progressPercent} percent complete`}>
                <span style={{ width: `${course.progressPercent}%` }} />
              </div>
              <p>
                {course.completedLessons} of {course.totalLessons} lessons · {course.progressPercent}%
              </p>
              <div className="cms-actions">
                <Link className="dash-primary" href={`/dashboard/courses/${course.id}`}>
                  Open course
                </Link>
                {course.continueLessonId ? (
                  <Link href={`/learn/lessons/${course.continueLessonId}`}>Continue learning</Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
