"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { unitsForSlide, type ContentBlock, type Slide } from "@/lib/content";
import { loadStudentLesson, saveLessonProgress, type LessonProgress, type StudentLesson } from "@/lib/learn-api";
import { BlockView } from "./BlockView";

function revealedForBlock(block: ContentBlock, units: ReturnType<typeof unitsForSlide>, count: number, blockIndex: number) {
  if (block.type !== "text") return undefined;
  const owned = units
    .map((unit, index) => ({ unit, index }))
    .filter((item) => item.unit.kind === "text" && item.unit.blockIndex === blockIndex && item.index < count);
  if (block.variant === "list") {
    return owned.map((item) => (item.unit.kind === "text" ? item.unit.text : "")).join("\n");
  }
  return owned.map((item) => (item.unit.kind === "text" ? item.unit.text : "")).join(" ");
}

function blockVisible(units: ReturnType<typeof unitsForSlide>, count: number, blockIndex: number) {
  return units.some((unit, index) => index < count && unit.blockIndex === blockIndex);
}

export default function LessonPlayer({ lessonId }: { lessonId: string }) {
  const search = useSearchParams();
  const preview = search.get("preview") === "1";
  const [lesson, setLesson] = useState<StudentLesson | null>(null);
  const [error, setError] = useState("");
  const [slideIndex, setSlideIndex] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [checks, setChecks] = useState<LessonProgress["checkResults"]>({});
  const lock = useRef(false);

  useEffect(() => {
    loadStudentLesson(lessonId, preview).then((result) => {
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setLesson(result.data);
      const progress = result.data.progress;
      setSlideIndex(progress.currentSlideIndex || 0);
      setRevealed(Math.max(progress.revealedUnits || 1, 1));
      setChecks(progress.checkResults || {});
    });
  }, [lessonId, preview]);

  const slide: Slide | undefined = lesson?.slides[slideIndex];
  const units = useMemo(() => (slide ? unitsForSlide(slide) : []), [slide]);
  const complete = units.length === 0 || revealed >= units.length;
  const lastSlide = lesson ? slideIndex >= lesson.slides.length - 1 : true;
  const finished = Boolean(lesson?.progress.completed) && lastSlide && complete;

  async function persist(next: { slideIndex: number; revealed: number; checks: LessonProgress["checkResults"]; completed: boolean }) {
    if (preview) return;
    await saveLessonProgress(lessonId, {
      currentSlideIndex: next.slideIndex,
      revealedUnits: next.revealed,
      checkResults: next.checks,
      completed: next.completed,
    });
  }

  function advance() {
    if (!slide || lock.current) return;
    lock.current = true;
    window.setTimeout(() => {
      lock.current = false;
    }, 220);
    if (!complete) {
      const next = Math.min(revealed + 1, units.length);
      setRevealed(next);
      persist({ slideIndex, revealed: next, checks, completed: false });
      return;
    }
    if (!lastSlide) {
      const nextIndex = slideIndex + 1;
      setSlideIndex(nextIndex);
      setRevealed(initialReveal(lesson?.slides[nextIndex]));
      persist({ slideIndex: nextIndex, revealed: initialReveal(lesson?.slides[nextIndex]), checks, completed: false });
      return;
    }
    const done = requiredChecksPassed(lesson, checks);
    persist({ slideIndex, revealed, checks, completed: done });
    if (done && lesson) {
      setLesson({ ...lesson, progress: { ...lesson.progress, completed: true, completedAt: new Date().toISOString() } });
    }
  }

  function goBack() {
    if (slideIndex === 0) return;
    const nextIndex = slideIndex - 1;
    const prevUnits = lesson ? unitsForSlide(lesson.slides[nextIndex]) : [];
    setSlideIndex(nextIndex);
    setRevealed(prevUnits.length);
    persist({ slideIndex: nextIndex, revealed: prevUnits.length, checks, completed: false });
  }

  function answer(block: Extract<ContentBlock, { type: "check" }>, selectedId: string) {
    if (checks[block.id]?.correct !== undefined && checks[block.id]?.selectedId) return;
    const next = { ...checks, [block.id]: { selectedId, correct: selectedId === block.correctId } };
    setChecks(next);
    const done = lastSlide && complete && requiredChecksPassed(lesson, next);
    persist({ slideIndex, revealed, checks: next, completed: done });
    if (done && lesson) setLesson({ ...lesson, progress: { ...lesson.progress, completed: true, completedAt: new Date().toISOString() } });
  }

  if (error) {
    return (
      <AppShell variant="student" title="Lesson">
        <p className="cms-error">{error}</p>
        <Link href="/dashboard/courses">Back to courses</Link>
      </AppShell>
    );
  }

  if (!lesson || !slide) {
    return (
      <AppShell variant="student" title="Lesson">
        <p className="dash-empty">Loading lesson…</p>
      </AppShell>
    );
  }

  if (finished && lastSlide && complete) {
    return (
      <AppShell variant="student" title="Lesson complete">
        <article className="dash-card cms-stack">
          <h2>Nice work. You finished {lesson.title}.</h2>
          <p>
            {lesson.moduleCode} {lesson.chapterTitle ? `· ${lesson.chapterTitle}` : ""}
          </p>
          <p>This lesson is marked complete on your course.</p>
          <div className="cms-actions">
            <Link className="dash-primary" href={`/dashboard/courses/${lesson.moduleId}`}>
              Back to course
            </Link>
            {lesson.nextLessonId ? <Link href={`/learn/lessons/${lesson.nextLessonId}`}>Next lesson</Link> : null}
          </div>
        </article>
      </AppShell>
    );
  }

  return (
    <AppShell
      variant="student"
      title={lesson.title}
      subtitle={`${lesson.moduleCode ?? ""} ${lesson.chapterTitle ? `· ${lesson.chapterTitle}` : ""}`}
    >
      <div className="player">
        <div className="player-bar">
          <Link href={`/dashboard/courses/${lesson.moduleId}`}>← {lesson.moduleName || "Course"}</Link>
          <span>
            Slide {slideIndex + 1} of {lesson.slides.length}
          </span>
          <div className="dash-bar" aria-label="Lesson progress">
            <span style={{ width: `${Math.round(((slideIndex + (complete ? 1 : revealed / Math.max(units.length, 1))) / Math.max(lesson.slides.length, 1)) * 100)}%` }} />
          </div>
        </div>
        <article
          className="player-stage dash-card"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("button, a, input, label, textarea, select")) return;
            advance();
          }}
        >
          <p className="dash-kicker">{slide.title}</p>
          {slide.blocks.map((block, blockIndex) => {
            if (!blockVisible(units, revealed, blockIndex)) return null;
            return (
              <div key={block.id} className="lp-reveal">
                <BlockView
                  block={block}
                  revealedText={block.type === "text" ? revealedForBlock(block, units, revealed, blockIndex) : undefined}
                  check={
                    block.type === "check"
                      ? {
                          selectedId: checks[block.id]?.selectedId ?? null,
                          locked: Boolean(checks[block.id]?.selectedId),
                          onSelect: (id) => answer(block, id),
                        }
                      : undefined
                  }
                />
              </div>
            );
          })}
        </article>
        <div className="player-nav">
          <button type="button" onClick={goBack} disabled={slideIndex === 0}>
            Previous slide
          </button>
          <button type="button" className="dash-primary" onClick={advance}>
            {complete ? (lastSlide ? "Finish lesson" : "Next slide") : "Continue"}
          </button>
          <Link href={`/dashboard/courses/${lesson.moduleId}`}>Exit</Link>
        </div>
      </div>
    </AppShell>
  );
}

function initialReveal(slide?: Slide) {
  if (!slide) return 0;
  return 1;
}

function requiredChecksPassed(lesson: StudentLesson | null, checks: LessonProgress["checkResults"]) {
  if (!lesson) return false;
  const ids = lesson.slides.flatMap((slide) => slide.blocks.filter((block) => block.type === "check").map((block) => block.id));
  return ids.every((id) => checks[id]?.correct === true);
}
