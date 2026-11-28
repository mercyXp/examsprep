"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { QuizBoard } from "@/app/components/assist/QuizBoard";
import AppShell from "@/app/components/shell/AppShell";
import { loadPerformance, loadQuizzes, type AttemptSummary, type QuizSummary } from "@/lib/learn-api";

function kindLabel(kind: string) {
  return kind === "mock" ? "Mock exam" : "Practice";
}

function minutes(seconds: number | null) {
  if (!seconds) return "Untimed";
  return `${Math.round(seconds / 60)} min`;
}

export default function QuizzesPage() {
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [recent, setRecent] = useState<AttemptSummary[]>([]);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([loadQuizzes(), loadPerformance()]).then(([quizResult, performance]) => {
      if (quizResult.ok) setQuizzes(quizResult.data);
      else setError(quizResult.message);
      if (performance.ok) setRecent(performance.data.recentAttempts);
      setReady(true);
    });
  }, []);

  return (
    <AppShell variant="student" title="Quizzes & Mock Exams" subtitle="Chapter quizzes, a practice paper, and a timed mock. Scores stay on your account.">
      <div className="dash-body cms-stack">
        {!ready ? <p className="dash-empty">Loading quizzes…</p> : null}
        {error ? <p className="cms-error">{error}</p> : null}
        {ready && !quizzes.length ? (
          <p className="dash-empty">No quizzes are published for your modules yet. Select a programme and add a module that has assessments.</p>
        ) : null}
        <ul className="cms-grid">
          {quizzes.map((quiz) => (
            <li key={quiz.id} className="dash-card">
              <p className="dash-kicker">
                {kindLabel(quiz.kind)}
                {quiz.moduleCode ? ` · ${quiz.moduleCode}` : ""}
                {` · ${minutes(quiz.timeLimitSeconds)}`}
              </p>
              <h2>{quiz.title}</h2>
              <p>
                {quiz.questionCount} questions
                {quiz.passMarkPercent != null ? ` · pass mark ${quiz.passMarkPercent}%` : ""}
              </p>
              <p>
                {quiz.attemptCount
                  ? `Best ${quiz.bestScorePercent}% · latest ${quiz.latestScorePercent}% · ${quiz.attemptCount} attempt${quiz.attemptCount === 1 ? "" : "s"}`
                  : "Not attempted yet"}
              </p>
              <Link className="dash-primary" href={`/dashboard/quizzes/${quiz.id}`}>
                {quiz.kind === "mock" ? "Start mock exam" : "Start quiz"}
              </Link>
            </li>
          ))}
        </ul>
        <article className="dash-card">
          <header className="dash-card-head">
            <h2>Recent results</h2>
            <Link href="/dashboard/progress">Topic performance</Link>
          </header>
          {recent.length ? (
            <ul className="cms-lessons">
              {recent.map((attempt) => (
                <li key={attempt.id}>
                  <div>
                    <h3>{attempt.title}</h3>
                    <p>
                      {attempt.scorePercent}%{attempt.passed ? " · Passed" : " · Not passed"}
                      {attempt.timedOut ? " · Time expired" : ""}
                    </p>
                  </div>
                  <Link href={`/dashboard/quizzes/attempts/${attempt.id}`}>Review</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dash-empty">Your attempt history will appear here after the first submission.</p>
          )}
        </article>
        <QuizBoard />
      </div>
    </AppShell>
  );
}
