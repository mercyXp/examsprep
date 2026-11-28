"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import AppShell from "@/app/components/shell/AppShell";
import { BackLink, GuideDialog, InfoBanner, LessonStatus, MenuButton, MenuLink, RowMenu, routeParam } from "@/app/components/cms/LessonGuide";
import {
  courseLabel,
  createLesson,
  deleteLesson,
  lessonEditorHref,
  loadChapters,
  loadLessons,
  loadScope,
  saveLessonMeta,
  type AdminChapter,
  type AdminLesson,
  type AdminScope,
} from "@/lib/cms";

type LessonDialog =
  | { mode: "create" }
  | { mode: "rename"; lesson: AdminLesson }
  | null;

function ChapterLessonsPage() {
  const router = useRouter();
  const params = useParams<{ lessonId: string; chapterId: string }>();
  const courseId = routeParam(params.lessonId);
  const chapterId = routeParam(params.chapterId);
  const returnPath = `/admin/lessons/${courseId}/chapters/${chapterId}`;
  const [scope, setScope] = useState<AdminScope | null>(null);
  const [chapters, setChapters] = useState<AdminChapter[]>([]);
  const [lessons, setLessons] = useState<AdminLesson[]>([]);
  const [lessonsOk, setLessonsOk] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [missingCourse, setMissingCourse] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<LessonDialog>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const seenKey = useRef("");

  useEffect(() => {
    let cancelled = false;
    const routeKey = `${courseId}:${chapterId}`;
    if (seenKey.current !== routeKey) {
      seenKey.current = routeKey;
      setReady(false);
      setChapters([]);
      setLessons([]);
      setLessonsOk(false);
      setMissingCourse(false);
      setError("");
    }
    Promise.all([loadScope(), loadChapters(courseId), loadLessons(courseId, chapterId)]).then(([scopeResult, chapterResult, lessonResult]) => {
      if (cancelled) return;
      setDialog(null);
      if (scopeResult.ok) setScope(scopeResult.data);
      else setError(scopeResult.message);
      if (!chapterResult.ok) {
        setMissingCourse(true);
        setError(chapterResult.message);
        setChapters([]);
      } else {
        setMissingCourse(false);
        setChapters(chapterResult.data);
      }
      if (!lessonResult.ok) {
        setLessonsOk(false);
        setError(lessonResult.message);
        setLessons([]);
      } else {
        setLessonsOk(true);
        setLessons(lessonResult.data);
        if (chapterResult.ok && scopeResult.ok) setError("");
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [courseId, chapterId, reloadKey]);

  const course = scope?.modules.find((item) => item.id === courseId);
  const chapterIndex = chapters.findIndex((item) => item.id === chapterId);
  const chapter = chapterIndex >= 0 ? chapters[chapterIndex] : null;
  const missingChapter = ready && !missingCourse && !chapter;
  const heading = chapter ? `Lessons for Chapter ${chapterIndex + 1}: ${chapter.title}` : "Lessons";
  const subtitle = course ? courseLabel(course) : "Lessons in this chapter";

  function refresh() {
    setReloadKey((value) => value + 1);
  }

  function closeDialog() {
    if (busy) return;
    setDialog(null);
    setFormError("");
  }

  function openCreate() {
    setMenuId(null);
    setTitle("");
    setDescription("");
    setFormError("");
    setDialog({ mode: "create" });
  }

  function openRename(lesson: AdminLesson) {
    setMenuId(null);
    setTitle(lesson.title);
    setDescription(lesson.description);
    setFormError("");
    setDialog({ mode: "rename", lesson });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle || busy || !dialog) return;
    setBusy(true);
    setFormError("");
    if (dialog.mode === "rename") {
      const lesson = dialog.lesson;
      const result = await saveLessonMeta(lesson.id, {
        title: nextTitle,
        description: description.trim(),
        objectives: lesson.objectives,
        durationMinutes: lesson.durationMinutes,
        difficulty: lesson.difficulty,
        moduleId: lesson.moduleId,
        chapterId: lesson.chapterId,
      });
      setBusy(false);
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      setDialog(null);
      refresh();
      return;
    }
    const result = await createLesson({
      title: nextTitle,
      description: description.trim(),
      objectives: [],
      durationMinutes: 15,
      difficulty: "beginner",
      moduleId: courseId,
      chapterId,
    });
    if (!result.ok) {
      setBusy(false);
      setFormError(result.message);
      return;
    }
    flushSync(() => {
      setBusy(false);
      setDialog(null);
    });
    router.push(lessonEditorHref(result.data.item.id, returnPath));
  }

  async function remove(lesson: AdminLesson) {
    setMenuId(null);
    if (!confirm(`Delete “${lesson.title}”? This cannot be undone.`)) return;
    const result = await deleteLesson(lesson.id);
    if (!result.ok) setError(result.message);
    else refresh();
  }

  return (
    <AppShell variant="admin" title={heading} subtitle={subtitle}>
      <div className="dash-body lesson-flow">
        <BackLink href={`/admin/lessons/${courseId}`} />
        {error && !missingCourse && !missingChapter ? (
          <p className="cms-error" role="alert">
            {error}
          </p>
        ) : null}
        {!ready ? <p className="dash-empty">Loading lessons…</p> : null}
        {ready && (missingCourse || missingChapter) ? (
          <section className="dash-card lesson-empty-card">
            <h2>{missingCourse ? "Course not available" : "Chapter not found"}</h2>
            <p>{missingCourse ? "This course is not on your account." : "That chapter is not part of this course."}</p>
            <Link className="dash-primary lesson-cta" href={missingCourse ? "/admin/lessons" : `/admin/lessons/${courseId}`}>
              {missingCourse ? "Back to Lessons" : "Back to chapters"}
            </Link>
          </section>
        ) : null}
        {ready && chapter && lessonsOk ? (
          <>
            <InfoBanner>Add lessons under this chapter.</InfoBanner>
            <div className="lesson-toolbar">
              <button type="button" className="dash-primary lesson-create" onClick={openCreate}>
                + Create Lesson
              </button>
            </div>
            <section className="dash-card">
              {lessons.length ? (
                <div className="lesson-table-wrap">
                  <table className="lesson-table">
                    <thead>
                      <tr>
                        <th>Lesson Title</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lessons.map((lesson) => {
                        const href = lessonEditorHref(lesson.id, returnPath);
                        return (
                          <tr key={lesson.id} className="lesson-row" onClick={() => router.push(href)}>
                            <td>
                              <Link className="lesson-title" href={href} onClick={(event) => event.stopPropagation()}>
                                {lesson.title}
                              </Link>
                            </td>
                            <td>
                              <LessonStatus status={lesson.status} />
                            </td>
                            <td onClick={(event) => event.stopPropagation()}>
                              <RowMenu
                                label={`Actions for ${lesson.title}`}
                                open={menuId === lesson.id}
                                onToggle={() => setMenuId((current) => (current === lesson.id ? null : lesson.id))}
                                onClose={() => setMenuId(null)}
                              >
                                <MenuLink href={href}>Edit</MenuLink>
                                <MenuButton onClick={() => openRename(lesson)}>Rename</MenuButton>
                                <MenuButton danger onClick={() => remove(lesson)}>
                                  Delete
                                </MenuButton>
                              </RowMenu>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="dash-empty">No lessons in this chapter yet.</p>
              )}
            </section>
          </>
        ) : null}
        <GuideDialog open={dialog !== null} title={dialog?.mode === "rename" ? "Rename Lesson" : "Create Lesson"} onClose={closeDialog}>
          <form className="lesson-form" onSubmit={onSubmit}>
            {formError ? (
              <p className="cms-error" role="alert">
                {formError}
              </p>
            ) : null}
            <label>
              <span>
                Lesson Title <span className="lesson-req">*</span>
              </span>
              <input value={title} maxLength={200} required onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label>
              Description (Optional)
              <textarea value={description} rows={4} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <div className="lesson-dialog-actions">
              <button type="button" className="dash-secondary" onClick={closeDialog} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="dash-primary" disabled={busy || !title.trim()}>
                {busy ? "Saving…" : dialog?.mode === "rename" ? "Save" : "Create Lesson"}
              </button>
            </div>
          </form>
        </GuideDialog>
      </div>
    </AppShell>
  );
}

export default function ChapterLessonsRoute() {
  return (
    <Suspense fallback={<p className="dash-empty">Loading lessons…</p>}>
      <ChapterLessonsPage />
    </Suspense>
  );
}
