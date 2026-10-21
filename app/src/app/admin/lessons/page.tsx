"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { LessonWorkflowButtons } from "@/app/components/cms/LessonWorkflow";
import {
  createLesson,
  deleteChapter,
  deleteLesson,
  loadChapters,
  loadLessons,
  loadModules,
  loadScope,
  moduleLabel,
  publishLesson,
  reorderChapters,
  reorderLessons,
  saveChapter,
  statusLabel,
  type AdminChapter,
  type AdminLesson,
  type AdminModule,
} from "@/lib/cms";

function LessonsManager() {
  const router = useRouter();
  const search = useSearchParams();
  const [modules, setModules] = useState<AdminModule[]>([]);
  const [moduleId, setModuleId] = useState(search.get("module") ?? "");
  const [chapters, setChapters] = useState<AdminChapter[]>([]);
  const [lessons, setLessons] = useState<AdminLesson[]>([]);
  const [chapterId, setChapterId] = useState("");
  const [query, setQuery] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [canPublish, setCanPublish] = useState(false);

  const selectedModule = modules.find((item) => item.id === moduleId);

  async function refresh(nextModule = moduleId, nextChapter = chapterId) {
    if (!nextModule) return;
    const [chapterResult, lessonResult] = await Promise.all([loadChapters(nextModule), loadLessons(nextModule, undefined, query)]);
    if (!chapterResult.ok) {
      setError(chapterResult.message);
      return;
    }
    if (!lessonResult.ok) {
      setError(lessonResult.message);
      return;
    }
    setChapters(chapterResult.data);
    setLessons(lessonResult.data);
    if (nextChapter && !chapterResult.data.some((item) => item.id === nextChapter)) setChapterId("");
  }

  useEffect(() => {
    Promise.all([loadModules(), loadScope()]).then(([result, scopeResult]) => {
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setModules(result.data);
      if (scopeResult.ok) setCanPublish(scopeResult.data.canPublish);
      const initial = search.get("module") || result.data[0]?.id || "";
      setModuleId(initial);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!moduleId) return;
    Promise.all([loadChapters(moduleId), loadLessons(moduleId)]).then(([chapterResult, lessonResult]) => {
      if (!chapterResult.ok) {
        setError(chapterResult.message);
        return;
      }
      if (!lessonResult.ok) {
        setError(lessonResult.message);
        return;
      }
      setChapters(chapterResult.data);
      setLessons(lessonResult.data);
    });
  }, [moduleId]);

  const visibleLessons = useMemo(
    () => lessons.filter((item) => (chapterId ? item.chapterId === chapterId : true)).filter((item) => item.title.toLowerCase().includes(query.toLowerCase())),
    [lessons, chapterId, query],
  );

  async function move(list: string[], index: number, direction: -1 | 1, kind: "chapter" | "lesson") {
    const next = index + direction;
    if (next < 0 || next >= list.length) return;
    const ids = [...list];
    [ids[index], ids[next]] = [ids[next], ids[index]];
    const result = kind === "chapter" ? await reorderChapters(moduleId, ids) : await reorderLessons(moduleId, ids);
    if (!result.ok) setError(result.message);
    else refresh();
  }

  return (
    <AppShell
      variant="admin"
      title="Chapters & Lessons"
      subtitle={
        selectedModule
          ? moduleLabel(selectedModule)
          : modules.length
            ? "Choose an assigned module to organise content."
            : "No modules are assigned to this account yet."
      }
    >
      <div className="dash-body cms-stack">
        <nav className="cms-crumbs">
          <Link href="/admin/courses">Courses</Link>
          {selectedModule ? <span>{selectedModule.code}</span> : null}
        </nav>
        {error ? <p className="cms-error">{error}</p> : null}
        {message ? <p className="cms-ok">{message}</p> : null}
        <div className="cms-toolbar">
          <label>
            Module
            <select
              value={moduleId}
              onChange={(event) => {
                setModuleId(event.target.value);
                setChapterId("");
              }}
            >
              {modules.map((item) => (
                <option key={item.id} value={item.id}>
                  {moduleLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Search lessons
            <input value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
        <div className="cms-split">
          <article className="dash-card">
            <header className="dash-card-head">
              <h2>Chapters</h2>
            </header>
            <form
              className="cms-inline"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!moduleId || !chapterTitle.trim()) return;
                const result = await saveChapter({ moduleId, title: chapterTitle.trim(), status: "DRAFT" });
                if (!result.ok) setError(result.message);
                else {
                  setChapterTitle("");
                  setMessage("Chapter created.");
                  refresh();
                }
              }}
            >
              <input value={chapterTitle} onChange={(event) => setChapterTitle(event.target.value)} placeholder="New chapter title" required />
              <button type="submit" className="dash-primary">
                Add
              </button>
            </form>
            <ul className="cms-lessons">
              <li>
                <button type="button" className={chapterId === "" ? "is-active cms-plain" : "cms-plain"} onClick={() => setChapterId("")}>
                  All lessons
                </button>
              </li>
              {chapters.map((chapter, index) => (
                <li key={chapter.id}>
                  <button
                    type="button"
                    className={chapterId === chapter.id ? "is-active cms-plain" : "cms-plain"}
                    onClick={() => setChapterId(chapter.id)}
                  >
                    <strong>{chapter.title}</strong>
                    <span>
                      {chapter.status} · {chapter.lessonCount} lessons
                    </span>
                  </button>
                  <div className="cms-actions">
                    <button type="button" onClick={() => move(chapters.map((item) => item.id), index, -1, "chapter")}>
                      Up
                    </button>
                    <button type="button" onClick={() => move(chapters.map((item) => item.id), index, 1, "chapter")}>
                      Down
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm(`Delete chapter “${chapter.title}”? Lessons stay in the module, unassigned.`)) return;
                        const result = await deleteChapter(chapter.id);
                        if (!result.ok) setError(result.message);
                        else refresh();
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </article>
          <article className="dash-card">
            <header className="dash-card-head">
              <h2>Lessons</h2>
            </header>
            <form
              className="cms-inline"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!moduleId || !lessonTitle.trim()) return;
                const result = await createLesson({
                  title: lessonTitle.trim(),
                  description: "",
                  objectives: [],
                  durationMinutes: 15,
                  difficulty: "beginner",
                  moduleId,
                  chapterId: chapterId || null,
                });
                if (!result.ok) {
                  setError(result.message);
                  return;
                }
                router.push(`/admin/lessons/${result.data.item.id}/edit`);
              }}
            >
              <input value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} placeholder="New lesson title" required />
              <button type="submit" className="dash-primary">
                Create lesson
              </button>
            </form>
            <ul className="cms-lessons">
              {visibleLessons.map((lesson) => (
                <li key={lesson.id}>
                  <div>
                    <h3>{lesson.title}</h3>
                    <p>
                      {statusLabel(lesson.status)} · {lesson.slideCount} slides · {lesson.chapterTitle || "Unassigned"}
                    </p>
                  </div>
                  <div className="cms-actions">
                    <button type="button" onClick={() => move(lessons.map((item) => item.id), lessons.findIndex((item) => item.id === lesson.id), -1, "lesson")}>
                      Up
                    </button>
                    <button type="button" onClick={() => move(lessons.map((item) => item.id), lessons.findIndex((item) => item.id === lesson.id), 1, "lesson")}>
                      Down
                    </button>
                    <Link href={`/admin/lessons/${lesson.id}/edit`}>Edit</Link>
                    <Link href={`/learn/lessons/${lesson.id}?preview=1`}>Preview</Link>
                    <LessonWorkflowButtons
                      lessonId={lesson.id}
                      status={lesson.status}
                      canPublish={canPublish}
                      onDone={() => refresh()}
                      onError={setError}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm(`Archive “${lesson.title}”?`)) return;
                        const result = await publishLesson(lesson.id, "archive");
                        if (!result.ok) setError(result.message);
                        else refresh();
                      }}
                    >
                      Archive
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm(`Delete draft “${lesson.title}”?`)) return;
                        const result = await deleteLesson(lesson.id);
                        if (!result.ok) setError(result.message);
                        else refresh();
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {!visibleLessons.length ? <p className="dash-empty">No lessons in this view yet.</p> : null}
          </article>
        </div>
      </div>
    </AppShell>
  );
}

export default function AdminLessonsPage() {
  return (
    <Suspense>
      <LessonsManager />
    </Suspense>
  );
}
