"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { loadCourses, type CourseSummary } from "@/lib/learn-api";

export default function ProgressPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);

  useEffect(() => {
    loadCourses().then((result) => {
      if (result.ok) setCourses(result.data);
    });
  }, []);

  const total = courses.reduce((sum, item) => sum + item.totalLessons, 0);
  const done = courses.reduce((sum, item) => sum + item.completedLessons, 0);

  return (
    <AppShell variant="student" title="Progress & Analytics" subtitle="Lesson completion across your published modules.">
      <div className="dash-body cms-stack">
        <article className="dash-card">
          <h2>
            {done} of {total} lessons complete
          </h2>
          <p>Quiz scores will appear here when mock exams are published.</p>
        </article>
        <ul className="cms-grid">
          {courses.map((course) => (
            <li key={course.id} className="dash-card">
              <h3>
                {course.code} — {course.name}
              </h3>
              <div className="dash-bar">
                <span style={{ width: `${course.progressPercent}%` }} />
              </div>
              <p>
                {course.completedLessons}/{course.totalLessons} · {course.progressPercent}%
              </p>
              <Link href={`/dashboard/courses/${course.id}`}>View course</Link>
            </li>
          ))}
        </ul>
        {!courses.length ? <p className="dash-empty">No published course progress to show yet.</p> : null}
      </div>
    </AppShell>
  );
}
