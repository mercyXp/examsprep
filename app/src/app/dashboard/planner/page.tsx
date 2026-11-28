"use client";

import { useEffect, useState } from "react";
import { RevisionPlan } from "@/app/components/assist/RevisionPlan";
import ExamTimetable from "@/app/components/dashboard/ExamTimetable";
import AppShell from "@/app/components/shell/AppShell";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { loadExamSchedule, type StudentExamSchedule } from "@/lib/learn-api";
import { formatGoal } from "@/lib/study";

export default function PlannerPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [schedule, setSchedule] = useState<StudentExamSchedule | null>(null);

  useEffect(() => {
    getSessionUser().then((session) => {
      if (session) setUser(session);
    });
    loadExamSchedule().then((result) => {
      if (result.ok) setSchedule(result.data);
    });
  }, []);

  return (
    <AppShell
      variant="student"
      title="Study Planner"
      subtitle="Revision time follows official examination dates and your study goals."
    >
      <div className="dash-body cms-stack">
        {user ? (
          <ExamTimetable user={user} onUser={setUser} schedule={schedule} />
        ) : (
          <p className="dash-empty">Loading planner…</p>
        )}
        <RevisionPlan />
        <article className="dash-card">
          <header className="dash-card-head">
            <h2>Daily goal</h2>
          </header>
          <p>{user ? `You planned ${formatGoal(user.dailyGoalMinutes)} a day.` : "Your daily goal appears after onboarding."}</p>
          <p className="dash-empty">Session-by-session scheduling will use this goal once study sessions are logged.</p>
        </article>
      </div>
    </AppShell>
  );
}
