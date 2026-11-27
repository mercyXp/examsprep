"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { LessonWorkflowButtons } from "@/app/components/cms/LessonWorkflow";
import { copyChapterTo, copyLessonTo, createFromTemplate, loadTemplates, type LessonTemplate } from "@/lib/authoring";
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
  const [statusFilter, setStatusFilter] = useState<"all" | "drafts" | "review" | "published">("all");
  const [copyModule, setCopyModule] = useState("");
  const [templates, setTemplates] = useState<LessonTemplate[]>([]);

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
      loadTemplates().then((templatesResult) => {
        if (templatesResult.ok) setTemplates(templatesResult.data);
      });
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
    () =>
      lessons
        .filter((item) => (chapterId ? item.chapterId === chapterId : true))
        .filter((item) => item.title.toLowerCase().includes(query.toLowerCase()))
        .filter((item) => {
          if (statusFilter === "drafts") return ["DRAFT", "CHANGES_REQUESTED", "UNPUBLISHED"].includes(item.status);
          if (statusFilter === "review") return item.status === "IN_REVIEW";
          if (statusFilter === "published") return item.status === "PUBLISHED";
          return true;
        }),
    [lessons, chapterId, query, statusFilter],
  );

  const draftLessons = lessons.filter((item) => ["DRAFT", "CHANGES_REQUESTED", "UNPUBLISHED", "IN_REVIEW"].includes(item.status));
  const draftCount = draftLessons.filter((item) => item.status !== "IN_REVIEW").length;

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
          <div className="cms-filters" role="group" aria-label="Lesson status">
            <button type="button" className={statusFilter === "all" ? "is-on" : undefined} onClick={() => setStatusFilter("all")}>
              All
            </button>
            <button type="button" className={statusFilter === "drafts" ? "is-on" : undefined} onClick={() => setStatusFilter("drafts")}>
              Drafts{draftCount ? ` (${draftCount})` : ""}
            </button>
            <button type="button" className={statusFilter === "review" ? "is-on" : undefined} onClick={() => setStatusFilter("review")}>
              In review
            </button>
            <button type="button" className={statusFilter === "published" ? "is-on" : undefined} onClick={() => setStatusFilter("published")}>
              Published
            </button>
          </div>
        </div>
        <article className="dash-card cms-drafts">
          <header className="dash-card-head">
            <h2>Your drafts</h2>
          </header>
          {draftLessons.length ? (
            <ul className="cms-lessons">
              {draftLessons.map((lesson) => (
                <li key={lesson.id}>
                  <div>
                    <h3>{lesson.title}</h3>
                    <p>
                      {statusLabel(lesson.status)} · {lesson.slideCount} slides · {lesson.chapterTitle || "Unassigned"}
                    </p>
                  </div>
                  <div className="cms-actions">
                    <Link className="dash-primary" href={`/admin/lessons/${lesson.id}/edit`}>
                      Edit draft
                    </Link>
                    <Link href={`/learn/lessons/${lesson.id}?preview=1`}>Preview</Link>
                    {lesson.status !== "IN_REVIEW" ? (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm(`Delete draft “${lesson.title}”? This cannot be undone.`)) return;
                          const result = await deleteLesson(lesson.id);
                          if (!result.ok) setError(result.message);
                          else refresh();
                        }}
                      >
                        Delete draft
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dash-empty">No drafts in this course yet. Create a lesson and it will stay here until you publish it.</p>
          )}
        </article>
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
                      disabled={!copyModule}
                      onClick={async () => {
                        if (!copyModule) return;
                        const result = await copyChapterTo(chapter.id, copyModule);
                        if (!result.ok) setError(result.message);
                        else setMessage(`“${chapter.title}” was copied as a draft. Open the other module to edit it.`);
                      }}
                    >
                      Copy chapter
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
            <div className="cms-inline">
              <label>
                Copy into
                <select value={copyModule} onChange={(event) => setCopyModule(event.target.value)}>
                  <option value="">Another module in your scope</option>
                  {modules
                    .filter((item) => item.id !== moduleId)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {moduleLabel(item)}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                New from template
                <select
                  defaultValue=""
                  onChange={async (event) => {
                    const template = event.target.value;
                    event.target.value = "";
                    if (!template || !moduleId) return;
                    const result = await createFromTemplate(moduleId, template, "", chapterId);
                    if (!result.ok) {
                      setError(result.message);
                      return;
                    }
                    router.push(`/admin/lessons/${result.data.item.id}/edit`);
                  }}
                >
                  <option value="">Choose a template</option>
                  {templates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <ul className="cms-lessons">
              {visibleLessons.map((lesson) => (
                <li key={lesson.id}>
                  <div>
                    <h3>
                      <Link href={`/admin/lessons/${lesson.id}/edit`}>{lesson.title}</Link>
                    </h3>
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
                    <Link className="dash-primary" href={`/admin/lessons/${lesson.id}/edit`}>
                      {lesson.status === "PUBLISHED" ? "Edit" : "Edit draft"}
                    </Link>
                    <Link href={`/learn/lessons/${lesson.id}?preview=1`}>Preview</Link>
                    <button
                      type="button"
                      disabled={!copyModule}
                      onClick={async () => {
                        if (!copyModule) return;
                        const result = await copyLessonTo(lesson.id, copyModule);
                        if (!result.ok) setError(result.message);
                        else setMessage(`“${lesson.title}” was copied as a draft into the module you chose.`);
                      }}
                    >
                      Copy lesson
                    </button>
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
                    {lesson.status !== "PUBLISHED" ? (
                      <button
                        type="button"
                        onClick={async () => {
                          const waiting = lesson.status === "IN_REVIEW";
                          if (
                            !confirm(
                              waiting
                                ? `“${lesson.title}” is waiting for review. Delete this draft anyway? This cannot be undone.`
                                : `Delete draft “${lesson.title}”? This cannot be undone.`,
                            )
                          )
                            return;
                          const result = await deleteLesson(lesson.id);
                          if (!result.ok) setError(result.message);
                          else refresh();
                        }}
                      >
                        Delete draft
                      </button>
                    ) : null}
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
