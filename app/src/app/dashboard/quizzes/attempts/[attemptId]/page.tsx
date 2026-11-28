"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { ResultCard } from "../../[quizId]/page";
import { loadAttempt, type QuizResult } from "@/lib/learn-api";

export default function AttemptReviewRoute() {
  return (
    <Suspense fallback={<p className="dash-empty">Loading result…</p>}>
      <AttemptReviewPage />
    </Suspense>
  );
}

function AttemptReviewPage() {
  const params = useParams<{ attemptId: string }>();
  const [result, setResult] = useState<QuizResult | null>(null);
  const [title, setTitle] = useState("Result");
  const [error, setError] = useState("");

  useEffect(() => {
    loadAttempt(params.attemptId).then((response) => {
      if (!response.ok) {
        setError(response.message);
        return;
      }
      setTitle(response.data.title || "Result");
      if (response.data.submitted === false) {
        setError("This attempt has not been submitted yet.");
        return;
      }
      setResult({
        attemptId: response.data.attemptId || response.data.id,
        scorePercent: response.data.scorePercent ?? 0,
        passed: Boolean(response.data.passed),
        timedOut: Boolean(response.data.timedOut),
        pointsEarned: response.data.pointsEarned ?? 0,
        pointsPossible: response.data.pointsPossible ?? 0,
        questions: response.data.questions ?? [],
      });
    });
  }, [params.attemptId]);

  return (
    <AppShell variant="student" title={title} subtitle="Saved result">
      <div className="dash-body cms-stack">
        <p>
          <Link href="/dashboard/quizzes">← Quizzes</Link>
        </p>
        {error ? <p className="cms-error">{error}</p> : null}
        {!result && !error ? <p className="dash-empty">Loading result…</p> : null}
        {result ? <ResultCard result={result} /> : null}
      </div>
    </AppShell>
  );
}
