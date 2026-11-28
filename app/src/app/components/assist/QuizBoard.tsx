"use client";

import { useEffect, useState } from "react";
import { AudioPlayer } from "@/app/components/assist/AudioPlayer";
import { proxyMedia, requestQuizAudio, type AudioMeta } from "@/lib/assist";
import { api } from "@/lib/api";

type QuizListItem = { id: string; title: string; kind: string; moduleCode: string | null };
type QuizQuestion = { id: string; prompt: string; points: number; choices: { id: string; label: string }[] };
type QuizDetail = {
  id: string;
  title: string;
  kind: string;
  passMarkPercent: number | null;
  timeLimitSeconds: number | null;
  questions: QuizQuestion[];
};

export function QuizBoard() {
  const [items, setItems] = useState<QuizListItem[] | null>(null);
  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [audio, setAudio] = useState<AudioMeta | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ items: QuizListItem[] }>("/api/learn/quizzes").then((result) => {
      if (!result.ok) setError(result.message);
      else setItems(result.data.items || []);
    });
  }, []);

  async function open(id: string) {
    setError("");
    setAudio(null);
    const result = await api<{ item: QuizDetail }>(`/api/learn/quizzes/${id}`);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setQuiz(result.data.item);
  }

  async function speak(part: "instruction" | "prompt" | "option" | "explanation", questionId?: string, optionId?: string) {
    if (!quiz) return;
    setBusy(true);
    setError("");
    const result = await requestQuizAudio({
      quiz_id: quiz.id,
      part,
      question_version_id: questionId,
      option_id: optionId,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      setAudio(null);
      return;
    }
    setAudio(result.data);
  }

  if (!quiz) {
    return (
      <article className="dash-card">
        {error ? <p className="cms-error">{error}</p> : null}
        {items === null ? <p className="dash-empty">Loading quizzes…</p> : null}
        {items && !items.length ? (
          <p>No quizzes are published yet. When an administrator releases a mock exam, it will appear here with audio for each part.</p>
        ) : null}
        {items?.length ? (
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => void open(item.id)}>
                  {item.moduleCode ? `${item.moduleCode} · ` : ""}
                  {item.title} · {item.kind}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </article>
    );
  }

  return (
    <div className="cms-stack">
      <article className="dash-card assist-panel">
        <header className="dash-card-head">
          <h2>{quiz.title}</h2>
          <button type="button" onClick={() => setQuiz(null)}>
            All quizzes
          </button>
        </header>
        <button type="button" disabled={busy} onClick={() => void speak("instruction")}>
          Listen to instructions
        </button>
        {error ? <p className="cms-error">{error}</p> : null}
        {audio ? <AudioPlayer src={proxyMedia(audio.url)} label="Quiz audio" /> : null}
        {audio?.message ? <p>{audio.message}</p> : null}
        {quiz.questions.map((question, index) => (
          <section key={question.id}>
            <h3>
              Question {index + 1}
            </h3>
            <p>{question.prompt}</p>
            <button type="button" disabled={busy} onClick={() => void speak("prompt", question.id)}>
              Listen to question
            </button>
            <ul>
              {question.choices.map((choice) => (
                <li key={choice.id}>
                  {choice.label}{" "}
                  <button type="button" disabled={busy} onClick={() => void speak("option", question.id, choice.id)}>
                    Listen
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" disabled={busy} onClick={() => void speak("explanation", question.id)}>
              Listen to explanation
            </button>
          </section>
        ))}
      </article>
    </div>
  );
}
