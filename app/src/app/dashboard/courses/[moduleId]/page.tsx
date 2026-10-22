"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { loadCourse, type CourseOverview } from "@/lib/learn-api";

function CourseOverviewPage() {
  const params = useParams<{ moduleId: string }>();
  const [course, setCourse] = useState<CourseOverview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadCourse(params.moduleId).then((result) => {
      if (result.ok) setCourse(result.data);
      else setError(result.message);
    });
  }, [params.moduleId]);

  return (
    <AppShell
      variant="student"
      title={course ? `${course.code} — ${course.name}` : "Course"}
      subtitle={course ? `${course.completedLessons} of ${course.totalLessons} lessons complete` : "Loading course…"}
    >
      <div className="dash-body cms-stack">
        <p>
          <Link href="/dashboard/courses">← My Courses</Link>
        </p>
        {error ? <p className="cms-error">{error}</p> : null}
        {course ? (
          <>
            <article className="dash-card">
              <p>{course.description || "No description yet."}</p>
              {course.objectives.length ? (
                <ul className="cms-list">
                  {course.objectives.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              <div className="dash-bar">
                <span style={{ width: `${course.progressPercent}%` }} />
              </div>
            </article>
            {course.chapters.map((chapter) => (
              <article key={chapter.id} className="dash-card">
                <header className="dash-card-head">
                  <h2>{chapter.title}</h2>
                </header>
                {chapter.description ? <p>{chapter.description}</p> : null}
                {chapter.lessons.length ? (
                  <ul className="cms-lessons">
                    {chapter.lessons.map((lesson) => (
                      <li key={lesson.id}>
                        <div>
                          <h3>{lesson.title}</h3>
                          <p>
                            {lesson.durationMinutes ? `${lesson.durationMinutes} min` : "Duration unset"}
                            {lesson.completed ? " · Completed" : lesson.currentSlideIndex ? " · In progress" : " · Not started"}
                          </p>
                        </div>
                        <Link className="dash-primary" href={`/learn/lessons/${lesson.id}`}>
                          {lesson.completed ? "Review" : lesson.currentSlideIndex ? "Continue" : "Start"}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dash-empty">No published lessons in this chapter yet.</p>
                )}
              </article>
            ))}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function CourseOverviewRoute() {
  return (
    <Suspense fallback={<p className="dash-empty">Loading course…</p>}>
      <CourseOverviewPage />
    </Suspense>
  );
}
