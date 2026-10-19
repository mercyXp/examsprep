"use client";

import { useEffect, useRef, type CSSProperties } from "react";

const WEEK = [
  { label: "M", state: "done" },
  { label: "T", state: "done" },
  { label: "W", state: "done" },
  { label: "T", state: "today" },
  { label: "F", state: "empty" },
  { label: "S", state: "empty" },
  { label: "S", state: "empty" },
] as const;

const QUIZ = ["A", "B", "C", "D"] as const;
const BARS = [18, 28, 38, 50, 62, 76, 100];

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        className="check-path"
        d="M3.2 8.2 6.4 11.4 12.8 4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2.5" y="4" width="13" height="11.5" rx="2.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2.5 7.5h13M6 2.5v3M12 2.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function GameIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2" y="6" width="14" height="8.5" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 10.2h3M7.5 8.7v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12.2" cy="9.2" r="0.9" fill="currentColor" />
      <circle cx="13.6" cy="11.1" r="0.9" fill="currentColor" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M3.2 4.2A2.2 2.2 0 0 1 5.4 3.2H14.5v11.2H5.4A2.2 2.2 0 0 0 3.2 16.6V4.2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M6.2 6.2h6.2M6.2 9h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3 14.2h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M5.2 14.2V9.2M9 14.2V6.2M12.8 14.2V3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function BulbIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9 2.8a4.4 4.4 0 0 0-2.4 8c.4.3.7.8.7 1.3v.4h3.4v-.4c0-.5.3-1 .7-1.3A4.4 4.4 0 0 0 9 2.8Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M7.4 14.4h3.2M7.8 16h2.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="arrow" width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M3.5 9h11M10 4.5 14.5 9 10 13.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Features() {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      panel.classList.add("is-on");
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          panel.classList.add("is-on");
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );

    io.observe(panel);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={panelRef}
      className="features-panel"
      id="features"
      aria-labelledby="features-title"
    >
      <header className="features-head">
        <p className="features-kicker rise-in">What’s inside</p>
        <h2 id="features-title" className="features-title rise-in delay-1">
          Everything to feel ready.
        </h2>
        <a className="features-more rise-in delay-2" href="/features">
          more features
          <ArrowIcon />
        </a>
      </header>

      <div className="features-grid">
        <article className="feature-card rise-in delay-2">
          <h3 className="feature-card-title">
            <span className="feature-icon is-lilac">
              <CalendarIcon />
            </span>
            Study plan
          </h3>
          <div className="week" aria-label="Study week, Monday to Wednesday complete, Thursday in progress">
            {WEEK.map((day, index) => (
              <div key={`${day.label}-${index}`} className={`week-day is-${day.state}`}>
                <span className="week-label">{day.label}</span>
                <span className="week-mark">
                  {day.state === "done" ? <CheckIcon /> : null}
                  {day.state === "today" ? <span className="week-pulse" /> : null}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="feature-card rise-in delay-3">
          <h3 className="feature-card-title">
            <span className="feature-icon is-pink">
              <GameIcon />
            </span>
            Quizzes & games
          </h3>
          <span className="quiz-plus" aria-hidden="true">
            A+
          </span>
          <div className="quiz" aria-label="Quiz options, answer B selected">
            {QUIZ.map((option) => (
              <div
                key={option}
                className={option === "B" ? "quiz-opt is-picked" : "quiz-opt"}
              >
                <span>{option}</span>
                <span className="quiz-line" />
              </div>
            ))}
          </div>
        </article>

        <article className="feature-card rise-in delay-4">
          <h3 className="feature-card-title">
            <span className="feature-icon is-mint">
              <BookIcon />
            </span>
            Simple lessons
          </h3>
          <div className="lesson" aria-hidden="true">
            <span className="lesson-line is-hi" />
            <span className="lesson-line" />
            <span className="lesson-line is-mid" />
            <span className="lesson-line is-short" />
            <span className="lesson-bulb">
              <BulbIcon />
            </span>
          </div>
        </article>

        <article className="feature-card rise-in delay-5">
          <h3 className="feature-card-title">
            <span className="feature-icon is-blue">
              <ChartIcon />
            </span>
            Your progress
          </h3>
          <div className="progress-art" aria-label="Progress ring filling and weekly bars growing">
            <div className="progress-ring-wrap">
              <svg className="progress-ring" viewBox="0 0 120 120" aria-hidden="true">
                <circle className="progress-track" cx="60" cy="60" r="46" />
                <circle className="progress-fill" cx="60" cy="60" r="46" />
              </svg>
              <span className="progress-check">
                <CheckIcon />
              </span>
            </div>
            <div className="progress-bars">
              {BARS.map((height, index) => (
                <span
                  key={height}
                  className={index === BARS.length - 1 ? "progress-bar is-strong" : "progress-bar"}
                  style={{ "--h": `${height}%` } as CSSProperties}
                />
              ))}
            </div>
          </div>
        </article>
      </div>

      <a className="features-mock rise-in delay-5" href="#mock-exam" id="mock-exam" aria-label="Begin mock exam">
        <span className="features-mock-copy">
          <span className="features-mock-title">Mock exam</span>
          <span className="features-mock-text">Practise under real exam conditions.</span>
        </span>
        <span className="features-mock-begin">Begin</span>
      </a>
    </section>
  );
}
