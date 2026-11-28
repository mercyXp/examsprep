"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { loadCourses, loadPerformance, type CourseSummary, type PerformanceSummary } from "@/lib/learn-api";

export default function ProgressPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [performance, setPerformance] = useState<PerformanceSummary | null>(null);

  useEffect(() => {
    loadCourses().then((result) => {
      if (result.ok) setCourses(result.data);
    });
    loadPerformance().then((result) => {
      if (result.ok) setPerformance(result.data);
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
          <p>
            {performance?.averageScorePercent != null
              ? `Average quiz score ${performance.averageScorePercent}% from ${performance.attemptCount} attempt${performance.attemptCount === 1 ? "" : "s"}.`
              : "Quiz scores appear here after you submit a chapter quiz or mock exam."}
          </p>
          {performance ? (
            <p>
              {performance.questionsCorrect} of {performance.questionsAnswered} questions marked correct.
            </p>
          ) : null}
        </article>
        <article className="dash-card">
          <header className="dash-card-head">
            <h2>Topic performance</h2>
            <Link href="/dashboard/quizzes">Quizzes</Link>
          </header>
          {performance?.topics.length ? (
            <ul className="cms-lessons">
              {performance.topics.map((topic) => (
                <li key={`${topic.moduleCode}-${topic.title}`}>
                  <div>
                    <h3>
                      {topic.moduleCode ? `${topic.moduleCode} · ` : ""}
                      {topic.title}
                    </h3>
                    <p>
                      {topic.correct} of {topic.answered} correct · {topic.percent}%
                    </p>
                  </div>
                  <div className="dash-bar" aria-label={`${topic.percent} percent`}>
                    <span style={{ width: `${topic.percent}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dash-empty">Topic scores appear after a submitted quiz. Each question is grouped by its chapter.</p>
          )}
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
