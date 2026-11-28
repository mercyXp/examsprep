"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { ResearchAssistant } from "@/app/components/assist/ResearchAssistant";
import { BackLink, ChapterMark, GuideDialog, InfoBanner, MenuButton, RowMenu, routeParam } from "@/app/components/cms/LessonGuide";
import {
  courseLabel,
  deleteChapter,
  loadChapters,
  loadScope,
  reorderChapters,
  saveChapter,
  type AdminChapter,
  type AdminScope,
} from "@/lib/cms";

type ChapterDialog =
  | { mode: "create" }
  | { mode: "rename"; chapter: AdminChapter }
  | null;

function ManageChaptersPage() {
  const router = useRouter();
  const search = useSearchParams();
  const params = useParams<{ lessonId: string }>();
  const courseId = routeParam(params.lessonId);
  const [scope, setScope] = useState<AdminScope | null>(null);
  const [chapters, setChapters] = useState<AdminChapter[]>([]);
  const [ready, setReady] = useState(false);
  const [chaptersOk, setChaptersOk] = useState(false);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ChapterDialog>(null);
  const [title, setTitle] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const seenCourse = useRef("");

  useEffect(() => {
    if (search.get("module")) router.replace(`/admin/lessons/${courseId}`);
  }, [search, courseId, router]);

  useEffect(() => {
    let cancelled = false;
    if (seenCourse.current !== courseId) {
      seenCourse.current = courseId;
      setReady(false);
      setChapters([]);
      setChaptersOk(false);
      setMissing(false);
      setError("");
    }
    Promise.all([loadScope(), loadChapters(courseId)]).then(([scopeResult, chapterResult]) => {
      if (cancelled) return;
      if (scopeResult.ok) setScope(scopeResult.data);
      else setError(scopeResult.message);
      if (!chapterResult.ok) {
        setMissing(chapterResult.status === 404 || chapterResult.status === 403 || chapterResult.status === 422);
        setError(chapterResult.message);
        setChapters([]);
        setChaptersOk(false);
      } else {
        setMissing(false);
        setChapters(chapterResult.data);
        setChaptersOk(true);
        if (scopeResult.ok) setError("");
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [courseId, reloadKey]);

  const course = scope?.modules.find((item) => item.id === courseId);
  const subtitle = course ? `Create chapters for ${courseLabel(course)}` : ready && missing ? "This course is not available." : "Create chapters for this course";

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
    setFormError("");
    setDialog({ mode: "create" });
  }

  function openRename(chapter: AdminChapter) {
    setMenuId(null);
    setTitle(chapter.title);
    setFormError("");
    setDialog({ mode: "rename", chapter });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle || busy) return;
    setBusy(true);
    setFormError("");
    const result =
      dialog?.mode === "rename"
        ? await saveChapter(
            { moduleId: courseId, title: nextTitle, description: dialog.chapter.description, status: dialog.chapter.status },
            dialog.chapter.id,
          )
        : await saveChapter({ moduleId: courseId, title: nextTitle, description: "", status: "DRAFT" });
    setBusy(false);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setDialog(null);
    refresh();
  }

  async function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= chapters.length) return;
    setMenuId(null);
    const ids = chapters.map((item) => item.id);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    const result = await reorderChapters(courseId, ids);
    if (!result.ok) setError(result.message);
    else refresh();
  }

  async function remove(chapter: AdminChapter) {
    setMenuId(null);
    if (!confirm(`Delete chapter “${chapter.title}”? Lessons in it stay in the course, but they will no longer appear under a chapter.`)) return;
    const result = await deleteChapter(chapter.id);
    if (!result.ok) setError(result.message);
    else refresh();
  }

  return (
    <AppShell variant="admin" title="Manage Chapters" subtitle={subtitle}>
      <div className="dash-body lesson-flow">
        <BackLink href="/admin/lessons" />
        {course ? <ResearchAssistant modules={scope?.modules || [course]} initialModuleId={course.id} /> : null}
        {error && !missing ? (
          <p className="cms-error" role="alert">
            {error}
          </p>
        ) : null}
        {!ready ? <p className="dash-empty">Loading chapters…</p> : null}
        {ready && missing ? (
          <section className="dash-card lesson-empty-card">
            <h2>Course not available</h2>
            <p>Choose a course from the lessons list, or add one under Courses & Modules.</p>
            <Link className="dash-primary lesson-cta" href="/admin/courses">
              Open Courses & Modules
            </Link>
          </section>
        ) : null}
        {ready && chaptersOk ? (
          <>
            <InfoBanner>First, create a chapter. Then you can add lessons under it.</InfoBanner>
            <div className="lesson-toolbar">
              <button type="button" className="dash-primary lesson-create" onClick={openCreate}>
                + Create Chapter
              </button>
            </div>
            <section className="dash-card">
              {chapters.length ? (
                <ul className="lesson-chapters" aria-label="Chapters">
                  {chapters.map((chapter, index) => (
                    <li key={chapter.id} className="lesson-chapter">
                      <Link className="lesson-chapter-main" href={`/admin/lessons/${courseId}/chapters/${chapter.id}`}>
                        <ChapterMark />
                        <span>
                          Chapter {index + 1}: {chapter.title}
                        </span>
                      </Link>
                      <RowMenu
                        label={`Actions for ${chapter.title}`}
                        open={menuId === chapter.id}
                        onToggle={() => setMenuId((current) => (current === chapter.id ? null : chapter.id))}
                        onClose={() => setMenuId(null)}
                      >
                        <MenuButton onClick={() => openRename(chapter)}>Rename</MenuButton>
                        <MenuButton disabled={index === 0} onClick={() => move(index, -1)}>
                          Move up
                        </MenuButton>
                        <MenuButton disabled={index === chapters.length - 1} onClick={() => move(index, 1)}>
                          Move down
                        </MenuButton>
                        <MenuButton danger onClick={() => remove(chapter)}>
                          Delete
                        </MenuButton>
                      </RowMenu>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dash-empty">No chapters yet. Create the first chapter, then add lessons under it.</p>
              )}
            </section>
          </>
        ) : null}
        <GuideDialog open={dialog !== null} title={dialog?.mode === "rename" ? "Rename Chapter" : "Create Chapter"} onClose={closeDialog}>
          <form className="lesson-form" onSubmit={onSubmit}>
            {formError ? (
              <p className="cms-error" role="alert">
                {formError}
              </p>
            ) : null}
            <label>
              <span>
                Chapter Title <span className="lesson-req">*</span>
              </span>
              <input value={title} maxLength={180} required onChange={(event) => setTitle(event.target.value)} />
            </label>
            <div className="lesson-dialog-actions">
              <button type="button" className="dash-secondary" onClick={closeDialog} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="dash-primary" disabled={busy || !title.trim()}>
                {busy ? "Saving…" : dialog?.mode === "rename" ? "Save" : "Create Chapter"}
              </button>
            </div>
          </form>
        </GuideDialog>
      </div>
    </AppShell>
  );
}

export default function ManageChaptersRoute() {
  return (
    <Suspense fallback={<p className="dash-empty">Loading chapters…</p>}>
      <ManageChaptersPage />
    </Suspense>
  );
}
