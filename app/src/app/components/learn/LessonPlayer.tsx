"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import BrandLogo from "@/app/components/ui/BrandLogo";
import {
  initialRevealCount,
  lessonResources,
  minRevealCount,
  unitsForSlide,
  type ContentBlock,
  type Slide,
} from "@/lib/content";
import {
  loadCourse,
  loadStudentLesson,
  saveLessonProgress,
  type CourseOverview,
  type LessonProgress,
  type StudentLesson,
} from "@/lib/learn-api";
import { FullNotes } from "./FullNotes";
import { handlePlayerKey, SlideStage } from "./SlideStage";

export default function LessonPlayer({ lessonId }: { lessonId: string }) {
  const search = useSearchParams();
  const preview = search.get("preview") === "1";
  const [lesson, setLesson] = useState<StudentLesson | null>(null);
  const [course, setCourse] = useState<CourseOverview | null>(null);
  const [error, setError] = useState("");
  const [slideIndex, setSlideIndex] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [checks, setChecks] = useState<LessonProgress["checkResults"]>({});
  const [mode, setMode] = useState<"presentation" | "notes">("presentation");
  const [navTab, setNavTab] = useState<"content" | "notes">("content");
  const [drawer, setDrawer] = useState<null | "nav" | "resources" | "more">(null);
  const [focusMode, setFocusMode] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const lock = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadStudentLesson(lessonId, preview).then((result) => {
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setLesson(result.data);
      const progress = result.data.progress;
      const index = progress.currentSlideIndex || 0;
      const nextSlide = result.data.slides[index];
      setSlideIndex(index);
      setRevealed(Math.max(progress.revealedUnits || initialRevealCount(nextSlide), initialRevealCount(nextSlide)));
      setChecks(progress.checkResults || {});
      loadCourse(result.data.moduleId).then((courseResult) => {
        if (courseResult.ok) setCourse(courseResult.data);
      });
    });
  }, [lessonId, preview]);

  const slide: Slide | undefined = lesson?.slides[slideIndex];
  const units = useMemo(() => (slide ? unitsForSlide(slide) : []), [slide]);
  const complete = units.length === 0 || revealed >= units.length;
  const lastSlide = lesson ? slideIndex >= lesson.slides.length - 1 : true;
  const resources = lesson ? lessonResources(lesson.slides) : [];
  const progressPercent = lesson
    ? Math.round(((slideIndex + (complete ? 1 : revealed / Math.max(units.length, 1))) / Math.max(lesson.slides.length, 1)) * 100)
    : 0;

  useEffect(() => {
    stageRef.current?.focus();
  }, [slideIndex, mode]);

  async function persist(next: { slideIndex: number; revealed: number; checks: LessonProgress["checkResults"]; completed: boolean }) {
    if (preview) return;
    await saveLessonProgress(lessonId, {
      currentSlideIndex: next.slideIndex,
      revealedUnits: next.revealed,
      checkResults: next.checks,
      completed: next.completed,
    });
  }

  function withLock(action: () => void) {
    if (lock.current) return;
    lock.current = true;
    action();
    window.setTimeout(() => {
      lock.current = false;
    }, 180);
  }

  function markCompleteIfReady(nextChecks = checks, nextRevealed = revealed, nextIndex = slideIndex) {
    const atEnd = Boolean(lesson && nextIndex >= lesson.slides.length - 1);
    const unitsDone = !slide || nextRevealed >= unitsForSlide(lesson?.slides[nextIndex] ?? slide).length;
    const done = atEnd && unitsDone && requiredChecksPassed(lesson, nextChecks);
    if (done && lesson) {
      setLesson({ ...lesson, progress: { ...lesson.progress, completed: true, completedAt: new Date().toISOString() } });
    }
    return done;
  }

  function goToSlide(index: number, reveal?: number) {
    if (!lesson) return;
    const nextSlide = lesson.slides[index];
    const nextReveal = reveal ?? initialRevealCount(nextSlide);
    setSlideIndex(index);
    setRevealed(nextReveal);
    persist({ slideIndex: index, revealed: nextReveal, checks, completed: false });
  }

  function nextPoint() {
    if (!slide) return;
    withLock(() => {
      if (!complete) {
        const next = Math.min(revealed + 1, units.length);
        setRevealed(next);
        persist({ slideIndex, revealed: next, checks, completed: markCompleteIfReady(checks, next, slideIndex) });
        return;
      }
      persist({ slideIndex, revealed, checks, completed: markCompleteIfReady() });
    });
  }

  function previousPoint() {
    if (!slide) return;
    withLock(() => {
      const floor = minRevealCount(slide);
      if (revealed > floor) {
        const next = revealed - 1;
        setRevealed(next);
        persist({ slideIndex, revealed: next, checks, completed: false });
      }
    });
  }

  function nextSlide() {
    if (!lesson || lastSlide) return;
    goToSlide(slideIndex + 1);
  }

  function previousSlide() {
    if (slideIndex === 0) return;
    const prev = lesson?.slides[slideIndex - 1];
    goToSlide(slideIndex - 1, prev ? unitsForSlide(prev).length : 0);
  }

  function revealAll() {
    if (!slide) return;
    setRevealed(units.length);
    persist({ slideIndex, revealed: units.length, checks, completed: markCompleteIfReady(checks, units.length, slideIndex) });
  }

  function answer(block: Extract<ContentBlock, { type: "check" }>, selectedId: string) {
    if (checks[block.id]?.correct !== undefined && checks[block.id]?.selectedId) return;
    const next = { ...checks, [block.id]: { selectedId, correct: selectedId === block.correctId } };
    setChecks(next);
    persist({ slideIndex, revealed, checks: next, completed: markCompleteIfReady(next) });
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
      <AppShell variant="student" layout="studio">
        <p className="dash-empty">Loading lesson…</p>
      </AppShell>
    );
  }

  const unitTitle = lesson.chapterTitle || "Unit";
  const unitIndex = Math.max((course?.chapters.findIndex((item) => item.id === lesson.chapterId) ?? 0) + 1, 1);
  const currentChapter = course?.chapters.find((item) => item.lessons.some((entry) => entry.id === lesson.id));
  const lessonNumber = Math.max((currentChapter?.lessons.findIndex((item) => item.id === lesson.id) ?? 0) + 1, 1);
  const courseLabel = lesson.moduleName || course?.name || "Course";

  return (
    <AppShell variant="student" layout="studio">
      <div
        className={`learn${focusMode ? " is-focus" : ""}${mode === "notes" ? " is-notes" : ""}`}
        ref={stageRef}
        tabIndex={0}
        onKeyDown={(event) => {
          if (mode === "notes" || drawer) return;
          handlePlayerKey(event, nextPoint, previousPoint);
        }}
      >
        {drawer ? (
          <button type="button" className="learn-backdrop" aria-label="Close panel" onClick={() => setDrawer(null)} />
        ) : null}
        <header className="learn-mobile-top">
          <button type="button" onClick={() => setDrawer(drawer === "nav" ? null : "nav")} aria-label="Course navigation">
            ☰
          </button>
          <BrandLogo href="/dashboard" className="learn-brand" />
          <span>
            Lesson {lessonNumber}: {lesson.title}
            <em>
              Slide {slideIndex + 1} of {lesson.slides.length}
            </em>
          </span>
        </header>
        <aside className={`learn-nav${drawer === "nav" ? " is-open" : ""}`}>
          <button type="button" className="learn-nav-close" onClick={() => setDrawer(null)}>
            Close
          </button>
          <p className="learn-kicker">Course</p>
          <h2>{courseLabel}</h2>
          <p className="learn-progress-label">{course?.progressPercent ?? 0}% Complete</p>
          <div className="learn-bar" aria-hidden="true">
            <span style={{ width: `${course?.progressPercent ?? 0}%` }} />
          </div>
          <div className="learn-tabs">
            <button type="button" className={navTab === "content" ? "is-on" : undefined} onClick={() => setNavTab("content")}>
              Content
            </button>
            <button
              type="button"
              className={navTab === "notes" ? "is-on" : undefined}
              onClick={() => {
                setNavTab("notes");
                setMode("notes");
              }}
            >
              Notes
            </button>
          </div>
          {navTab === "notes" ? (
            <div className="learn-nav-notes">
              <p>Full notes use the same slides as presentation mode.</p>
              <button type="button" className="learn-btn-primary" onClick={() => setMode("notes")}>
                Read Full Notes
              </button>
            </div>
          ) : (
            <div className="learn-tree">
              {(course?.chapters ?? [{ id: lesson.chapterId || "unit", title: unitTitle, description: "", lessons: [] }]).map(
                (chapter, chapterIndex) => (
                  <details key={chapter.id} open={chapter.id === lesson.chapterId || !lesson.chapterId}>
                    <summary>
                      Unit {chapterIndex + 1}: {chapter.title}
                      <em>
                        {chapter.lessons.filter((item) => item.completed).length}/{chapter.lessons.length || 0}
                      </em>
                    </summary>
                    {(chapter.lessons.length ? chapter.lessons : [{ id: lesson.id, title: lesson.title, completed: false, currentSlideIndex: slideIndex, description: "", durationMinutes: null, difficulty: null }]).map(
                      (item, itemIndex) => (
                        <div key={item.id} className={`learn-lesson${item.id === lesson.id ? " is-current" : ""}`}>
                          {item.id === lesson.id ? (
                            <strong>
                              Lesson {itemIndex + 1}: {item.title}
                            </strong>
                          ) : (
                            <Link href={`/learn/lessons/${item.id}`}>
                              Lesson {itemIndex + 1}: {item.title}
                            </Link>
                          )}
                          {item.id === lesson.id ? (
                            <>
                              {lesson.slides.map((entry, index) => (
                                <button
                                  key={entry.id}
                                  type="button"
                                  className={`learn-node is-${slideKind(entry)}${index === slideIndex && mode === "presentation" ? " is-on" : ""}`}
                                  onClick={() => {
                                    goToSlide(index, index === slideIndex ? revealed : initialRevealCount(entry));
                                    setMode("presentation");
                                    setDrawer(null);
                                  }}
                                >
                                  {nodeLabel(entry, index)}
                                </button>
                              ))}
                              <button
                                type="button"
                                className="learn-node is-resources"
                                onClick={() => {
                                  setDrawer("resources");
                                  setMode("presentation");
                                }}
                              >
                                Resources
                              </button>
                            </>
                          ) : null}
                        </div>
                      ),
                    )}
                  </details>
                ),
              )}
            </div>
          )}
          <Link className="learn-all" href={`/dashboard/courses/${lesson.moduleId}`}>
            All Course Content
          </Link>
        </aside>
        <section className="learn-main">
          <div className="learn-crumb">
            <Link href={`/dashboard/courses/${lesson.moduleId}`}>
              {lesson.moduleCode || course?.code}
              {courseLabel ? `: ${courseLabel}` : ""}
            </Link>
            <span>Unit {unitIndex}</span>
            <span>Lesson {lessonNumber}</span>
            <span>Slide {slideIndex + 1}</span>
            {preview ? <em>Student preview</em> : null}
          </div>
          <div className="learn-head">
            <div>
              <h1>{slide.title}</h1>
              <p>
                Slide {slideIndex + 1} of {lesson.slides.length}
              </p>
            </div>
            <div className="learn-head-actions">
              {mode === "notes" ? (
                <div className="learn-mode">
                  <button type="button" onClick={() => setMode("presentation")}>
                    Presentation
                  </button>
                  <button type="button" className="is-on">
                    Full Notes
                  </button>
                </div>
              ) : (
                <button type="button" className="learn-notes-btn" onClick={() => setMode("notes")}>
                  Read Full Notes
                </button>
              )}
            </div>
          </div>
          {lesson.progress.completed ? <p className="learn-complete">This lesson is marked complete. You can still review the slides and notes.</p> : null}
          {mode === "notes" ? (
            <div className="learn-notes-wrap">
              <FullNotes slides={lesson.slides} checks={checks} startIndex={slideIndex} hideResources />
              <section className="learn-card learn-notes-resources">
                <header>
                  <h2>Resources</h2>
                </header>
                {resources.length ? (
                  <ul>
                    {resources.map((item) => (
                      <li key={item.id}>
                        {item.url ? (
                          <a href={item.url} target="_blank" rel="noreferrer">
                            {item.title || item.url}
                          </a>
                        ) : (
                          <span>{item.title}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dash-empty">No resources on this lesson yet.</p>
                )}
              </section>
            </div>
          ) : (
            <div className="learn-stage">
              <SlideStage
                slide={slide}
                revealed={revealed}
                checks={checks}
                onAnswer={answer}
                onAdvance={nextPoint}
                interactive={slide.clickToAdvance !== false}
                numbered
              />
              <div className="learn-stage-bar">
                <button type="button" onClick={previousPoint} disabled={slideIndex === 0 && revealed <= minRevealCount(slide)}>
                  ← Previous Point
                </button>
                <div className="learn-dots" aria-hidden="true">
                  {units.map((unit, index) => (
                    <i key={unit.id} className={index < revealed ? "is-on" : undefined} />
                  ))}
                </div>
                <button type="button" className="learn-btn-primary" onClick={nextPoint} disabled={complete}>
                  Next Point
                </button>
                <button type="button" className="learn-stage-reveal" onClick={revealAll} disabled={complete}>
                  Reveal All
                </button>
                <p>Click anywhere on the slide or press Space / Right Arrow to reveal the next point</p>
              </div>
              <p className="learn-points-caption">
                {Math.min(revealed, Math.max(units.length, 1))} of {Math.max(units.length, 1)} points revealed
              </p>
            </div>
          )}
          {mode === "presentation" ? (
            <div className="learn-slide-nav">
              <button type="button" onClick={previousSlide} disabled={slideIndex === 0}>
                ‹ Previous Slide
              </button>
              <label>
                <span className="sr-only">Jump to slide</span>
                <select value={String(slideIndex)} onChange={(event) => goToSlide(Number(event.target.value))}>
                  {lesson.slides.map((item, index) => (
                    <option key={item.id} value={index}>
                      Slide {index + 1} of {lesson.slides.length}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="learn-btn-primary" onClick={nextSlide} disabled={lastSlide}>
                Next Slide ›
              </button>
            </div>
          ) : null}
          <div className="learn-foot">
            <div>
              <span>Lesson Progress</span>
              <div className="learn-bar" aria-label="Lesson progress">
                <span style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
            <button type="button" onClick={() => setShortcuts((open) => !open)}>
              Keyboard Shortcuts
            </button>
            {resources[0]?.url ? (
              <a href={resources[0].url} target="_blank" rel="noreferrer">
                Download
              </a>
            ) : (
              <span className="cms-muted">Download</span>
            )}
            <label className="learn-switch">
              Focus Mode
              <input type="checkbox" checked={focusMode} onChange={(event) => setFocusMode(event.target.checked)} />
            </label>
          </div>
          {shortcuts ? (
            <p className="learn-shortcuts">Space or → next point · ← previous point · Next Slide waits until every item on this slide is revealed.</p>
          ) : null}
        </section>
        <aside className={`learn-rail${drawer === "resources" ? " is-open" : ""}`}>
          <section className="learn-card">
            <header>
              <h2>Resources</h2>
            </header>
            {resources.length ? (
              <ul>
                {resources.map((item) => (
                  <li key={item.id}>
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noreferrer">
                        {item.title || item.url}
                      </a>
                    ) : (
                      <span>{item.title}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dash-empty">No resources on this lesson yet.</p>
            )}
          </section>
          <section className="learn-card">
            <header>
              <h2>Notes</h2>
            </header>
            <p className="dash-empty">You have no notes for this slide yet.</p>
            <p className="cms-muted">Student notes are not stored on the server yet, so nothing typed here would be saved.</p>
            <button type="button" className="learn-notes-btn learn-add-note" disabled title="Student notes are not stored on the server yet.">
              Add Note
            </button>
          </section>
          <section className="learn-card">
            <header>
              <h2>Lesson Overview</h2>
            </header>
            {lesson.objectives.length ? (
              <ul className="learn-objectives">
                {lesson.objectives.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>{lesson.description || "No overview has been added yet."}</p>
            )}
          </section>
        </aside>
        <nav className="learn-mobile-bar">
          <button type="button" onClick={previousSlide} disabled={slideIndex === 0}>
            Previous Slide
          </button>
          <button type="button" onClick={() => setMode(mode === "notes" ? "presentation" : "notes")}>
            {mode === "notes" ? "Presentation" : "Read Full Notes"}
          </button>
          <button type="button" onClick={() => setDrawer(drawer === "resources" ? null : "resources")}>
            Resources
          </button>
          <button type="button" onClick={() => setDrawer(drawer === "more" ? null : "more")}>
            More
          </button>
        </nav>
        {drawer === "more" ? (
          <div className="learn-more">
            <button type="button" onClick={revealAll}>
              Reveal All
            </button>
            <button type="button" onClick={() => setFocusMode((value) => !value)}>
              {focusMode ? "Exit focus mode" : "Focus Mode"}
            </button>
            <Link href={`/dashboard/courses/${lesson.moduleId}`}>All Course Content</Link>
            <button type="button" onClick={() => setDrawer(null)}>
              Close
            </button>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function requiredChecksPassed(lesson: StudentLesson | null, checks: LessonProgress["checkResults"]) {
  if (!lesson) return false;
  const ids = lesson.slides.flatMap((item) => item.blocks.filter((block) => block.type === "check").map((block) => block.id));
  return ids.every((id) => checks[id]?.correct === true);
}

function slideKind(slide: Slide) {
  if (slide.layout === "assessment" || slide.blocks.some((block) => block.type === "check")) return "quiz";
  if (slide.layout === "case") return "case";
  if (slide.layout === "summary") return "summary";
  if (slide.blocks.length === 1 && slide.blocks[0]?.type === "audio") return "audio";
  return "slide";
}

function nodeLabel(slide: Slide, index: number) {
  const kind = slideKind(slide);
  if (kind === "quiz") return `Quiz: ${slide.title}`;
  if (kind === "case") return `Case Study: ${slide.title}`;
  if (kind === "audio") return `Audio Note: ${slide.title}`;
  if (kind === "summary") return "Summary";
  return `Slide ${index + 1}: ${slide.title}`;
}
