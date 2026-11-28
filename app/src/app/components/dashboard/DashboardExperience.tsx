"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { loadCourses, loadExamSchedule, loadPerformance, type CourseSummary, type PerformanceSummary, type StudentExamSchedule } from "@/lib/learn-api";
import { daysUntil, examDateParts, examSittingCaption, formatGoal, remainingLabel, SEMESTER_MODULES } from "@/lib/study";

function firstName(user: SessionUser | null) {
  const name = user?.name?.trim();
  if (!name) return "there";
  return name.split(/\s+/)[0] ?? "there";
}

export default function DashboardExperience() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [schedule, setSchedule] = useState<StudentExamSchedule | null>(null);
  const [performance, setPerformance] = useState<PerformanceSummary | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    getSessionUser().then((session) => {
      if (session) setUser(session);
    });
    loadCourses().then((result) => {
      if (result.ok) setCourses(result.data);
    });
    loadExamSchedule().then((result) => {
      if (result.ok) setSchedule(result.data);
    });
    loadPerformance().then((result) => {
      if (result.ok) setPerformance(result.data);
    });
  }, []);

  const modules = useMemo(() => {
    if (schedule?.modules.length) return schedule.modules;
    const codes = user?.moduleCodes ?? [];
    const fallback = codes.length ? SEMESTER_MODULES.filter((mod) => codes.includes(mod.code)) : SEMESTER_MODULES;
    return fallback.map((mod) => {
      const plan = user?.moduleExamPlans?.[mod.code];
      const estimated = plan?.estimatedDate ?? user?.examTimetable?.[mod.code] ?? null;
      return {
        code: mod.code,
        name: mod.name,
        examType: plan?.examType || "regular",
        examTypeName: plan?.examType || "Regular examinations",
        source: estimated ? ("estimated" as const) : ("unpublished" as const),
        examDate: estimated,
        examTime: null,
        windowStart: estimated,
        windowEnd: estimated,
        official: false,
        estimatedDate: estimated,
      };
    });
  }, [schedule, user]);
  const nextIso = schedule?.nextDate || modules.find((item) => item.examDate)?.examDate || null;
  const remaining = remainingLabel(nextIso);
  const goalLabel = formatGoal(user?.dailyGoalMinutes ?? 60);
  const continueCourse = courses.find((item) => item.continueLessonId) ?? courses.find((item) => item.totalLessons > 0);
  const filtered = courses.filter((item) => `${item.code} ${item.name}`.toLowerCase().includes(query.trim().toLowerCase()));
  const shown = query.trim() ? filtered : courses;

  return (
    <AppShell
      variant="student"
      title={`Hey ${firstName(user)} 👋`}
      subtitle="Keep going. Study smart, not just hard."
      actions={
        <label className="dash-search">
          <span className="sr-only">Search courses</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your courses…" />
        </label>
      }
    >
      <div className="dash-body">
        <section className="dash-stats" aria-label="Study snapshot">
          <article className="dash-stat is-streak">
            <header>
              <span>Study Streak</span>
              <span className="dash-stat-ico" aria-hidden="true">🔥</span>
            </header>
            <strong>0 days</strong>
            <p>Start a lesson to begin a streak.</p>
          </article>
          <article className="dash-stat is-week">
            <header>
              <span>Lessons completed</span>
            </header>
            <strong>{courses.reduce((sum, item) => sum + item.completedLessons, 0)}</strong>
            <p>Across your published modules.</p>
          </article>
          <article className="dash-stat is-q">
            <header>
              <span>Questions Completed</span>
            </header>
            <strong>{performance?.questionsAnswered ?? 0}</strong>
            <p>{performance?.questionsAnswered ? "Questions marked on submitted quizzes." : "Practice quizzes appear after you start one."}</p>
          </article>
          <article className="dash-stat is-score">
            <header>
              <span>Average Practice Score</span>
            </header>
            <strong>{performance?.averageScorePercent != null ? `${performance.averageScorePercent}%` : "—"}</strong>
            <p>{performance?.attemptCount ? `Across ${performance.attemptCount} submitted attempt${performance.attemptCount === 1 ? "" : "s"}.` : "Scores appear after your first attempt."}</p>
          </article>
        </section>

        <section className="dash-mid">
          <article className="dash-card">
            <header className="dash-card-head">
              <h2>Daily Study Goal</h2>
              <span>0m / {goalLabel}</span>
            </header>
            <p>Study for {goalLabel} today</p>
            <div className="dash-bar" aria-label="Daily goal 0 percent">
              <span style={{ width: "0%" }} />
            </div>
            <small>Time tracking starts as you complete lessons.</small>
          </article>
          <article className="dash-ai">
            <div>
              <p className="dash-kicker">Study Assistant</p>
              <h2>Revise toward the next sitting first.</h2>
              <p>
                {nextIso
                  ? `Priority follows official sittings first, then any estimated dates. Next sitting is in ${daysUntil(nextIso)} days.`
                  : "The assistant uses official sittings when they are published, or your estimates until then."}
              </p>
              <Link href="/dashboard/assistant" className="dash-ai-btn">
                Open assistant
              </Link>
            </div>
          </article>
        </section>

        <section className="dash-lower">
          <div className="dash-col">
            <article className="dash-card">
              <header className="dash-card-head">
                <h2>Continue Learning</h2>
                <Link href="/dashboard/courses">View all</Link>
              </header>
              {continueCourse ? (
                <div className="dash-continue">
                  <div className="dash-continue-copy">
                    <p className="dash-kicker is-live">In progress</p>
                    <h3>
                      {continueCourse.code} — {continueCourse.name}
                    </h3>
                    <p>
                      {continueCourse.completedLessons} of {continueCourse.totalLessons} lessons complete
                    </p>
                  </div>
                  <div className="dash-bar" aria-label={`${continueCourse.progressPercent} percent`}>
                    <span style={{ width: `${continueCourse.progressPercent}%` }} />
                  </div>
                  <Link
                    href={
                      continueCourse.continueLessonId
                        ? `/learn/lessons/${continueCourse.continueLessonId}`
                        : `/dashboard/courses/${continueCourse.id}`
                    }
                    className="dash-primary"
                  >
                    {continueCourse.completedLessons ? "Continue lesson" : "Start first lesson"}
                  </Link>
                </div>
              ) : (
                <p className="dash-empty">Published lessons will appear here.</p>
              )}
            </article>
          </div>

          <div className="dash-col">
            <article className="dash-card">
              <header className="dash-card-head">
                <h2>Upcoming Exams</h2>
                <span>{remaining}</span>
              </header>
              <ul className="dash-exams">
                {modules.map((mod, index) => {
                  const iso = mod.examDate || (mod.official ? mod.windowStart : null);
                  const parts = iso ? examDateParts(iso) : null;
                  return (
                    <li key={mod.code} className={`is-mod-${index % 5}`}>
                      <div className="dash-exam-date">
                        <strong>{parts?.day ?? "—"}</strong>
                        <span>{parts ? `${parts.month} ${parts.year}` : "TBC"}</span>
                      </div>
                      <div>
                        <h3>
                          {mod.code} — {mod.name}
                        </h3>
                        <p>
                          {examSittingCaption(mod)} · {remainingLabel(iso)}
                        </p>
                      </div>
                      <Link className="dash-plan" href="/dashboard/planner">
                        {mod.official ? "Open planner" : "Set estimate"}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </article>

            <article className="dash-card">
              <header className="dash-card-head">
                <h2>My Courses</h2>
                <Link href="/dashboard/courses">View all</Link>
              </header>
              <ul className="dash-courses">
                {(shown.length ? shown : courses).map((mod, index) => (
                  <li key={mod.id}>
                    <span className={`dash-mod is-mod-${index % 5}`} aria-hidden="true" />
                    <div>
                      <h3>
                        {mod.code} — {mod.name}
                      </h3>
                      <p>
                        {mod.completedLessons}/{mod.totalLessons} lessons
                      </p>
                    </div>
                    <div className="dash-course-meta">
                      <span>{mod.progressPercent}%</span>
                      <div className="dash-bar">
                        <span style={{ width: `${mod.progressPercent}%` }} />
                      </div>
                      <Link href={`/dashboard/courses/${mod.id}`}>Open</Link>
                    </div>
                  </li>
                ))}
              </ul>
              {query.trim() && filtered.length === 0 ? <p className="dash-empty">No courses match that search.</p> : null}
            </article>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
