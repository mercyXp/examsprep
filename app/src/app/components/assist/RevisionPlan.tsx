"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Block = {
  minutes: number;
  kind: string;
  title: string;
  moduleCode: string;
  lessonId?: string;
  because: string[];
};

type Plan = {
  days: { date: string; blocks: Block[] }[];
  weakTopics: { topic: string; moduleCode: string; correct: number; attempts: number; because: string }[];
  evidence: string[];
  exams: { moduleCode: string; date: string | null; windowEnd: string | null; source: string; official: boolean }[];
  dailyGoalMinutes: number;
  message: string;
};

export function RevisionPlan() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Plan>("/api/learn/revision-plan").then((result) => {
      if (!result.ok) setError(result.message);
      else setPlan(result.data);
    });
  }, []);

  return (
    <article className="dash-card assist-panel">
      <header className="dash-card-head">
        <h2>Revision plan</h2>
        <span>{plan ? `${plan.dailyGoalMinutes} min goal` : "Loading"}</span>
      </header>
      {error ? <p className="cms-error">{error}</p> : null}
      {!plan && !error ? <p className="dash-empty">Loading your saved progress…</p> : null}
      {plan ? (
        <>
          {plan.message ? <p>{plan.message}</p> : null}
          <ul>
            {plan.evidence.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {plan.weakTopics.length ? (
            <>
              <h3>Weak topics</h3>
              <ul>
                {plan.weakTopics.map((topic) => (
                  <li key={`${topic.moduleCode}-${topic.topic}`}>
                    {topic.moduleCode} · {topic.topic} · {topic.correct} of {topic.attempts}. {topic.because}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {plan.days.length ? (
            <ol className="dash-time-mods">
              {plan.days.map((day) => (
                <li key={day.date}>
                  <p>
                    <strong>{day.date}</strong>
                  </p>
                  {day.blocks.map((block) => (
                    <p key={`${day.date}-${block.title}`}>
                      {block.minutes} min · {block.moduleCode} · {block.lessonId ? <Link href={`/learn/lessons/${block.lessonId}`}>{block.title}</Link> : block.title}
                      <br />
                      <small>{block.because.join(" ")}</small>
                    </p>
                  ))}
                </li>
              ))}
            </ol>
          ) : (
            <p className="dash-empty">{plan.message}</p>
          )}
        </>
      ) : null}
    </article>
  );
}
