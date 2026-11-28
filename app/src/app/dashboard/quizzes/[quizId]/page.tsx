"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import {
  loadQuiz,
  startQuiz,
  submitStartedQuiz,
  type GradedQuestion,
  type QuizAnswer,
  type QuizDetail,
  type QuizQuestion,
  type QuizResult,
} from "@/lib/learn-api";

function clock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function QuizTakeRoute() {
  return (
    <Suspense fallback={<p className="dash-empty">Loading quiz…</p>}>
      <QuizTakePage />
    </Suspense>
  );
}

function QuizTakePage() {
  const params = useParams<{ quizId: string }>();
  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [attemptId, setAttemptId] = useState("");
  const [deadline, setDeadline] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [written, setWritten] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);
  const choicesRef = useRef(choices);
  const writtenRef = useRef(written);
  const questionsRef = useRef(questions);
  const sendRef = useRef<() => void>(() => undefined);
  choicesRef.current = choices;
  writtenRef.current = written;
  questionsRef.current = questions;

  useEffect(() => {
    loadQuiz(params.quizId).then((response) => {
      if (response.ok) setQuiz(response.data);
      else setError(response.message);
    });
  }, [params.quizId]);

  useEffect(() => {
    if (!deadline || result) return;
    const tick = () => {
      const left = new Date(deadline).getTime() - Date.now();
      setRemaining(left);
      if (left <= 0) sendRef.current();
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [deadline, result]);

  async function begin() {
    if (!quiz) return;
    setBusy(true);
    setError("");
    const response = await startQuiz(quiz.id);
    setBusy(false);
    if (!response.ok) {
      setError(response.message);
      return;
    }
    setAttemptId(response.data.attemptId);
    setQuestions(response.data.questions);
    setDeadline(response.data.deadline);
  }

  async function send() {
    if (!quiz || !attemptId || submitted.current) return;
    submitted.current = true;
    setBusy(true);
    setError("");
    const paper = questionsRef.current.length ? questionsRef.current : quiz.questions;
    const answers: QuizAnswer[] = paper.map((question) => ({
      question_version_id: question.id,
      selected_option_ids: choicesRef.current[question.id] ? [choicesRef.current[question.id]] : [],
      response_text: writtenRef.current[question.id] || "",
    }));
    const response = await submitStartedQuiz(quiz.id, attemptId, answers);
    setBusy(false);
    if (!response.ok) {
      submitted.current = false;
      setError(response.message);
      return;
    }
    setResult(response.data);
  }

  sendRef.current = () => {
    void send();
  };

  const sitting = Boolean(attemptId) && !result;

  return (
    <AppShell variant="student" title={quiz?.title || "Quiz"} subtitle={quiz?.moduleCode || "Assessment"}>
      <div className="dash-body cms-stack">
        <p>
          <Link href="/dashboard/quizzes">← Quizzes</Link>
        </p>
        {error ? <p className="cms-error">{error}</p> : null}
        {!quiz ? <p className="dash-empty">Loading quiz…</p> : null}
        {quiz && !sitting && !result ? (
          <article className="dash-card">
            <p>
              {quiz.questions.length} questions
              {quiz.passMarkPercent != null ? ` · pass mark ${quiz.passMarkPercent}%` : ""}
              {quiz.timeLimitSeconds ? ` · ${Math.round(quiz.timeLimitSeconds / 60)} minutes` : " · no time limit"}
            </p>
            <p>
              {quiz.kind === "mock"
                ? "This is a timed mock. The clock starts when you press begin, and the paper is submitted when time runs out."
                : "This practice paper is marked as soon as you submit. You can try again afterwards."}
            </p>
            <button type="button" className="dash-primary" onClick={() => void begin()} disabled={busy}>
              {busy ? "Starting…" : quiz.kind === "mock" ? "Begin mock exam" : "Begin quiz"}
            </button>
          </article>
        ) : null}
        {sitting ? (
          <>
            {remaining != null ? (
              <p className={remaining < 60_000 ? "cms-error" : "dash-kicker"} role="timer">
                Time left {clock(remaining)}
              </p>
            ) : null}
            {questions.map((question, index) => (
              <article key={question.id} className="dash-card">
                <h2>
                  {index + 1}. {question.prompt}
                </h2>
                <p className="cms-muted">
                  {question.points} mark{question.points === 1 ? "" : "s"} · {question.kind.replace("_", " ")}
                </p>
                {question.kind === "short" || question.kind === "blank" || question.kind === "structured" ? (
                  <textarea
                    rows={question.kind === "structured" ? 6 : 2}
                    value={written[question.id] || ""}
                    aria-label={`Answer ${index + 1}`}
                    onChange={(event) => setWritten((current) => ({ ...current, [question.id]: event.target.value }))}
                  />
                ) : (
                  <fieldset className="lp-quiz">
                    <legend className="sr-only">Choices</legend>
                    {question.choices.map((choice) => (
                      <label key={choice.id}>
                        <input
                          type="radio"
                          name={question.id}
                          checked={choices[question.id] === choice.id}
                          onChange={() => setChoices((current) => ({ ...current, [question.id]: choice.id }))}
                        />{" "}
                        {choice.label}
                      </label>
                    ))}
                  </fieldset>
                )}
              </article>
            ))}
            <button type="button" className="dash-primary" onClick={() => void send()} disabled={busy}>
              {busy ? "Marking…" : "Submit answers"}
            </button>
          </>
        ) : null}
        {result ? <ResultCard result={result} /> : null}
      </div>
    </AppShell>
  );
}

export function ResultCard({ result }: { result: QuizResult }) {
  return (
    <article className="dash-card">
      <h2>
        {result.scorePercent}% · {result.passed ? "Passed" : "Not passed"}
      </h2>
      <p>
        {result.pointsEarned} of {result.pointsPossible} marks
        {result.timedOut ? " · submitted after the time limit" : ""}
      </p>
      <ul className="cms-stack">
        {result.questions.map((question, index) => (
          <li key={question.id}>
            <QuestionReview question={question} index={index} />
          </li>
        ))}
      </ul>
      <p>
        <Link href="/dashboard/quizzes">Back to quizzes</Link>
      </p>
    </article>
  );
}

function QuestionReview({ question, index }: { question: GradedQuestion; index: number }) {
  const partial = !question.correct && question.pointsAwarded > 0;
  const label = question.correct ? "Correct" : partial ? "Partial" : "Not correct";
  const chosen = question.choices.filter((choice) => question.selectedOptionIds.includes(choice.id)).map((choice) => choice.label);
  const expected = question.choices.filter((choice) => question.correctOptionIds.includes(choice.id)).map((choice) => choice.label);
  return (
    <article>
      <h3>
        {index + 1}. {label} · {question.pointsAwarded}/{question.points}
      </h3>
      <p>{question.prompt}</p>
      {chosen.length ? <p>Your choice: {chosen.join(", ")}</p> : null}
      {question.responseText ? <p>Your answer: {question.responseText}</p> : null}
      {expected.length ? <p>Expected: {expected.join(", ")}</p> : null}
      {question.modelAnswer ? <p>Model answer: {question.modelAnswer}</p> : null}
      {question.keyPointsPossible ? (
        <p>
          Key points found: {question.keyPointsMatched} of {question.keyPointsPossible}
        </p>
      ) : null}
      {question.explanation ? <p>{question.explanation}</p> : null}
    </article>
  );
}
