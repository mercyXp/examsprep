"use client";

import { useEffect, useState } from "react";
import { MathMarkdown } from "@/app/components/assist/MathMarkdown";
import { api } from "@/lib/api";
import { loadCourse, loadCourses, type CourseOverview, type CourseSummary } from "@/lib/learn-api";

const KINDS = [
  { id: "mcq", label: "Multiple choice" },
  { id: "tf", label: "True or false" },
  { id: "short", label: "Short answer" },
  { id: "structured", label: "Structured" },
  { id: "exam", label: "Exam style" },
];

type Choice = { id: string; label: string };
type Question = {
  id: string;
  prompt: string;
  kind: string;
  difficulty: string;
  topic: string;
  choices: Choice[];
  explanation?: string;
  modelAnswer?: string;
  correctOptionIds?: string[];
  official: boolean;
  attempt?: { correct: boolean | null; feedback: string };
};

type Performance = {
  attempts: number;
  markedAttempts: number;
  markedCorrect: number;
  unmarked: number;
  byTopic: { topic: string; attempts: number; correct: number; unmarked: number }[];
  note: string;
};

export function PracticeDesk() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [course, setCourse] = useState<CourseOverview | null>(null);
  const [moduleId, setModuleId] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [kinds, setKinds] = useState<string[]>(["mcq"]);
  const [difficulty, setDifficulty] = useState("standard");
  const [topic, setTopic] = useState("");
  const [items, setItems] = useState<Question[]>([]);
  const [performance, setPerformance] = useState<Performance | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadCourses().then((result) => {
      if (result.ok) setCourses(result.data);
    });
    api<Performance>("/api/learn/practice/performance").then((result) => {
      if (result.ok) setPerformance(result.data);
    });
  }, []);

  useEffect(() => {
    if (!moduleId) {
      setCourse(null);
      return;
    }
    loadCourse(moduleId).then((result) => {
      if (result.ok) setCourse(result.data);
    });
  }, [moduleId]);

  async function generate() {
    setBusy(true);
    setError("");
    const result = await api<{ items: Question[] }>("/api/learn/practice/generate", {
      method: "POST",
      body: JSON.stringify({
        module_id: moduleId,
        lesson_id: lessonId || null,
        kinds,
        difficulty,
        topic,
        count: 4,
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setItems(result.data.items || []);
  }

  async function answer(question: Question, payload: { answer?: string; selected_option_ids?: string[] }) {
    setError("");
    const result = await api<{ item: Question }>(`/api/learn/practice/${question.id}/answer`, {
      method: "POST",
      body: JSON.stringify({ answer: payload.answer || "", selected_option_ids: payload.selected_option_ids || [] }),
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setItems((list) => list.map((item) => (item.id === question.id ? result.data.item : item)));
    const stats = await api<Performance>("/api/learn/practice/performance");
    if (stats.ok) setPerformance(stats.data);
  }

  const lessons = course?.chapters.flatMap((chapter) => chapter.lessons) || [];

  return (
    <div className="cms-stack">
      <article className="dash-card assist-panel">
        <header className="dash-card-head">
          <h2>Generate practice</h2>
        </header>
        <p>Questions stay on your account. They are not added to official quizzes or mock exams.</p>
        <div className="assist-grid">
          <label>
            Course
            <select value={moduleId} onChange={(event) => { setModuleId(event.target.value); setLessonId(""); }}>
              <option value="">Choose a course</option>
              {courses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} — {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Lesson
            <select value={lessonId} onChange={(event) => setLessonId(event.target.value)}>
              <option value="">Any published lesson in the course</option>
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Difficulty
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
              <option value="foundation">Foundation</option>
              <option value="standard">Standard</option>
              <option value="challenge">Challenge</option>
            </select>
          </label>
          <label>
            Topic
            <input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Optional, for example normalisation" />
          </label>
        </div>
        <div className="studio-author-actions">
          {KINDS.map((kind) => (
            <label key={kind.id}>
              <input
                type="checkbox"
                checked={kinds.includes(kind.id)}
                onChange={(event) =>
                  setKinds((current) =>
                    event.target.checked ? [...current, kind.id] : current.filter((item) => item !== kind.id),
                  )
                }
              />{" "}
              {kind.label}
            </label>
          ))}
        </div>
        <button type="button" disabled={busy || !moduleId || !kinds.length} onClick={() => void generate()}>
          {busy ? "Writing questions…" : "Generate practice"}
        </button>
        {error ? <p className="cms-error" role="alert">{error}</p> : null}
      </article>
      {items.map((question) => (
        <QuestionCard key={question.id} question={question} onAnswer={(payload) => void answer(question, payload)} />
      ))}
      <article className="dash-card">
        <header className="dash-card-head">
          <h2>Your practice record</h2>
        </header>
        {performance ? (
          <>
            <p>
              {performance.markedCorrect} of {performance.markedAttempts} marked answers were correct.
              {performance.unmarked ? ` ${performance.unmarked} were left unmarked.` : ""}
            </p>
            <p>{performance.note}</p>
            <ul>
              {performance.byTopic.map((row) => (
                <li key={row.topic}>
                  {row.topic}: {row.correct} correct out of {row.attempts} attempts
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="dash-empty">Attempt counts appear after you answer a practice question.</p>
        )}
      </article>
    </div>
  );
}

function QuestionCard({
  question,
  onAnswer,
}: {
  question: Question;
  onAnswer: (payload: { answer?: string; selected_option_ids?: string[] }) => void;
}) {
  const [text, setText] = useState("");
  const [choice, setChoice] = useState("");
  return (
    <article className="dash-card assist-panel">
      <p>
        {question.kind} · {question.difficulty}
        {question.topic ? ` · ${question.topic}` : ""} · practice only
      </p>
      <MathMarkdown text={question.prompt} />
      {question.choices.length ? (
        <div className="assist-choices">
          {question.choices.map((option) => (
            <label key={option.id}>
              <input type="radio" name={question.id} checked={choice === option.id} onChange={() => setChoice(option.id)} /> {option.label}
            </label>
          ))}
          <button type="button" disabled={!choice || Boolean(question.attempt)} onClick={() => onAnswer({ selected_option_ids: [choice] })}>
            Check answer
          </button>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onAnswer({ answer: text });
          }}
        >
          <textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} />
          <button type="submit" disabled={!text.trim() || Boolean(question.attempt)}>
            Check answer
          </button>
        </form>
      )}
      {question.attempt ? (
        <div>
          <p>{question.attempt.correct === null ? "Not marked automatically." : question.attempt.correct ? "Correct." : "Not correct."}</p>
          <MathMarkdown text={question.attempt.feedback} />
          {question.explanation ? <MathMarkdown text={question.explanation} /> : null}
          {question.modelAnswer ? <MathMarkdown text={`Model answer: ${question.modelAnswer}`} /> : null}
        </div>
      ) : null}
    </article>
  );
}
