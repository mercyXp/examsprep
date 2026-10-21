"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { BlockView } from "@/app/components/learn/BlockView";
import {
  emptyBlock,
  emptySlide,
  type BlockType,
  type ContentBlock,
  type Slide,
} from "@/lib/content";
import { LessonStatusNote, LessonWorkflowButtons } from "@/app/components/cms/LessonWorkflow";
import {
  loadChapters,
  loadLesson,
  loadModules,
  loadScope,
  moduleLabel,
  saveLessonContent,
  saveLessonMeta,
  statusLabel,
  type AdminChapter,
  type AdminModule,
} from "@/lib/cms";

export default function LessonEditorPage() {
  const params = useParams<{ lessonId: string }>();
  const router = useRouter();
  const [modules, setModules] = useState<AdminModule[]>([]);
  const [chapters, setChapters] = useState<AdminChapter[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [objectives, setObjectives] = useState("");
  const [duration, setDuration] = useState("15");
  const [difficulty, setDifficulty] = useState("beginner");
  const [moduleId, setModuleId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [slideIndex, setSlideIndex] = useState(0);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [status, setStatus] = useState("DRAFT");
  const [canPublish, setCanPublish] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");

  const slide = slides[slideIndex];
  const selected = slide?.blocks.find((item) => item.id === blockId) ?? null;

  useEffect(() => {
    loadLesson(params.lessonId).then((result) => {
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const item = result.data;
      setTitle(item.title);
      setDescription(item.description);
      setObjectives(item.objectives.join("\n"));
      setDuration(String(item.durationMinutes ?? 15));
      setDifficulty(item.difficulty ?? "beginner");
      setModuleId(item.moduleId);
      setChapterId(item.chapterId ?? "");
      setSlides(item.slides?.length ? item.slides : [emptySlide(1)]);
      setStatus(item.status);
    });
    loadModules().then((result) => {
      if (result.ok) setModules(result.data);
    });
    loadScope().then((result) => {
      if (result.ok) setCanPublish(result.data.canPublish);
    });
  }, [params.lessonId]);

  useEffect(() => {
    if (!moduleId) return;
    loadChapters(moduleId).then((result) => {
      if (result.ok) setChapters(result.data);
    });
  }, [moduleId]);

  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  function updateSlides(next: Slide[]) {
    setSlides(next);
    setDirty(true);
  }

  function patchSlide(partial: Partial<Slide>) {
    if (!slide) return;
    updateSlides(slides.map((item, index) => (index === slideIndex ? { ...item, ...partial } : item)));
  }

  function patchBlock(next: ContentBlock) {
    if (!slide) return;
    patchSlide({ blocks: slide.blocks.map((item) => (item.id === next.id ? next : item)) });
    setBlockId(next.id);
  }

  async function saveAll() {
    setSaving("Saving…");
    setError("");
    const meta = await saveLessonMeta(params.lessonId, {
      title,
      description,
      objectives: objectives.split("\n").map((item) => item.trim()).filter(Boolean),
      durationMinutes: Number(duration) || null,
      difficulty,
      moduleId,
      chapterId: chapterId || null,
    });
    if (!meta.ok) {
      setSaving("");
      setError(meta.message);
      return false;
    }
    const content = await saveLessonContent(params.lessonId, slides);
    if (!content.ok) {
      setSaving("");
      setError(content.message);
      return false;
    }
    setDirty(false);
    setSaving("Saved.");
    return true;
  }

  const blockTypes: { type: BlockType; label: string }[] = [
    { type: "text", label: "Text" },
    { type: "code", label: "Code" },
    { type: "image", label: "Image" },
    { type: "callout", label: "Callout" },
    { type: "check", label: "Knowledge check" },
  ];

  const previewHref = useMemo(() => `/learn/lessons/${params.lessonId}?preview=1`, [params.lessonId]);

  return (
    <AppShell
      variant="admin"
      title="Lesson editor"
      subtitle={title || "Untitled lesson"}
      actions={
        <div className="cms-actions">
          <span>{saving || (dirty ? "Unsaved changes" : "All changes saved")}</span>
          <button type="button" className="dash-primary" onClick={() => saveAll()}>
            Save draft
          </button>
          <Link href={previewHref}>Preview</Link>
          <LessonWorkflowButtons
            lessonId={params.lessonId}
            status={status}
            canPublish={canPublish}
            beforeAction={saveAll}
            onDone={setStatus}
            onError={setError}
          />
        </div>
      }
    >
      <div className="editor">
        {error ? <p className="cms-error">{error}</p> : null}
        <LessonStatusNote status={status} />
        <nav className="cms-crumbs">
          <Link href="/admin/lessons">Chapters & Lessons</Link>
          <span>{title}</span>
          <span>{statusLabel(status)}</span>
        </nav>
        <aside className="editor-left dash-card">
          <h2>Slides</h2>
          <ul>
            {slides.map((item, index) => (
              <li key={item.id}>
                <button type="button" className={index === slideIndex ? "is-active" : undefined} onClick={() => { setSlideIndex(index); setBlockId(item.blocks[0]?.id ?? null); }}>
                  {item.title || `Slide ${index + 1}`}
                </button>
                <span>
                  <button type="button" onClick={() => index > 0 && (updateSlides(swap(slides, index, index - 1)), setSlideIndex(index - 1))}>
                    Up
                  </button>
                  <button type="button" onClick={() => index < slides.length - 1 && (updateSlides(swap(slides, index, index + 1)), setSlideIndex(index + 1))}>
                    Down
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="dash-primary"
            onClick={() => {
              const next = [...slides, emptySlide(slides.length + 1)];
              updateSlides(next);
              setSlideIndex(next.length - 1);
            }}
          >
            Add slide
          </button>
          <button
            type="button"
            onClick={() => {
              if (slides.length < 2) return;
              if (!confirm("Delete this slide?")) return;
              const next = slides.filter((_, index) => index !== slideIndex);
              updateSlides(next);
              setSlideIndex(Math.max(0, slideIndex - 1));
            }}
          >
            Delete slide
          </button>
        </aside>
        <section className="editor-main dash-card">
          {slide ? (
            <>
              <label>
                Slide title
                <input value={slide.title} onChange={(event) => patchSlide({ title: event.target.value })} />
              </label>
              <div className="cms-actions">
                {blockTypes.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => {
                      const block = emptyBlock(item.type);
                      patchSlide({ blocks: [...slide.blocks, block] });
                      setBlockId(block.id);
                    }}
                  >
                    Add {item.label}
                  </button>
                ))}
              </div>
              <ol className="editor-blocks">
                {slide.blocks.map((block, index) => (
                  <li key={block.id} className={block.id === blockId ? "is-on" : undefined}>
                    <button type="button" className="cms-plain" onClick={() => setBlockId(block.id)}>
                      <BlockView block={block} />
                    </button>
                    <div className="cms-actions">
                      <button type="button" onClick={() => index && patchSlide({ blocks: swap(slide.blocks, index, index - 1) })}>
                        Up
                      </button>
                      <button type="button" onClick={() => index < slide.blocks.length - 1 && patchSlide({ blocks: swap(slide.blocks, index, index + 1) })}>
                        Down
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const copy = { ...block, id: crypto.randomUUID() } as ContentBlock;
                          patchSlide({ blocks: [...slide.blocks.slice(0, index + 1), copy, ...slide.blocks.slice(index + 1)] });
                        }}
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!confirm("Delete this block?")) return;
                          patchSlide({ blocks: slide.blocks.filter((item) => item.id !== block.id) });
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
              {!slide.blocks.length ? <p className="dash-empty">Add a content block to this slide.</p> : null}
            </>
          ) : null}
        </section>
        <aside className="editor-right dash-card">
          <h2>Properties</h2>
          {selected ? <BlockFields block={selected} onChange={patchBlock} slides={slides} slideIndex={slideIndex} onMove={(nextIndex) => {
            if (!slide) return;
            const block = selected;
            const without = slide.blocks.filter((item) => item.id !== block.id);
            const nextSlides = slides.map((item, index) => {
              if (index === slideIndex) return { ...item, blocks: without };
              if (index === nextIndex) return { ...item, blocks: [...item.blocks, block] };
              return item;
            });
            updateSlides(nextSlides);
            setSlideIndex(nextIndex);
          }} /> : <p className="dash-empty">Select a block to edit it.</p>}
          <hr />
          <h2>Lesson</h2>
          <label>
            Title
            <input value={title} onChange={(event) => { setTitle(event.target.value); setDirty(true); }} />
          </label>
          <label>
            Description
            <textarea value={description} onChange={(event) => { setDescription(event.target.value); setDirty(true); }} />
          </label>
          <label>
            Objectives
            <textarea value={objectives} onChange={(event) => { setObjectives(event.target.value); setDirty(true); }} />
          </label>
          <label>
            Duration (minutes)
            <input value={duration} onChange={(event) => { setDuration(event.target.value); setDirty(true); }} />
          </label>
          <label>
            Difficulty
            <select value={difficulty} onChange={(event) => { setDifficulty(event.target.value); setDirty(true); }}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
          <label>
            Module
            <select value={moduleId} onChange={(event) => { setModuleId(event.target.value); setDirty(true); }}>
              {modules.map((item) => (
                <option key={item.id} value={item.id}>
                  {moduleLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Chapter
            <select value={chapterId} onChange={(event) => { setChapterId(event.target.value); setDirty(true); }}>
              <option value="">Unassigned</option>
              {chapters.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => router.push("/admin/lessons")}>
            Back to lessons
          </button>
        </aside>
      </div>
    </AppShell>
  );
}

function swap<T>(items: T[], from: number, to: number) {
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

function BlockFields({
  block,
  onChange,
  slides,
  slideIndex,
  onMove,
}: {
  block: ContentBlock;
  onChange: (block: ContentBlock) => void;
  slides: Slide[];
  slideIndex: number;
  onMove: (index: number) => void;
}) {
  if (block.type === "text") {
    return (
      <div className="cms-form">
        <label>
          Variant
          <select value={block.variant} onChange={(event) => onChange({ ...block, variant: event.target.value as typeof block.variant })}>
            <option value="heading">Heading</option>
            <option value="paragraph">Paragraph</option>
            <option value="list">List</option>
            <option value="definition">Definition</option>
          </select>
        </label>
        {block.variant === "list" ? (
          <label>
            Items (one per line)
            <textarea value={block.items.join("\n")} onChange={(event) => onChange({ ...block, items: event.target.value.split("\n") })} />
          </label>
        ) : (
          <label>
            Text
            <textarea value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} />
          </label>
        )}
        <MoveControl slides={slides} slideIndex={slideIndex} onMove={onMove} />
      </div>
    );
  }
  if (block.type === "code") {
    return (
      <div className="cms-form">
        <label>
          Language
          <select value={block.language} onChange={(event) => onChange({ ...block, language: event.target.value })}>
            <option value="sql">SQL</option>
            <option value="python">Python</option>
            <option value="javascript">JavaScript</option>
            <option value="java">Java</option>
            <option value="text">Text</option>
          </select>
        </label>
        <label>
          Code
          <textarea className="is-code" value={block.code} onChange={(event) => onChange({ ...block, code: event.target.value })} />
        </label>
        <MoveControl slides={slides} slideIndex={slideIndex} onMove={onMove} />
      </div>
    );
  }
  if (block.type === "image") {
    return (
      <div className="cms-form">
        <label>
          Image URL
          <input value={block.url} onChange={(event) => onChange({ ...block, url: event.target.value })} />
        </label>
        <label>
          Alt text
          <input value={block.alt} onChange={(event) => onChange({ ...block, alt: event.target.value })} />
        </label>
        <MoveControl slides={slides} slideIndex={slideIndex} onMove={onMove} />
      </div>
    );
  }
  if (block.type === "callout") {
    return (
      <div className="cms-form">
        <label>
          Tone
          <select value={block.tone} onChange={(event) => onChange({ ...block, tone: event.target.value as typeof block.tone })}>
            <option value="note">Note</option>
            <option value="tip">Tip</option>
            <option value="warning">Warning</option>
            <option value="important">Important</option>
          </select>
        </label>
        <label>
          Text
          <textarea value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} />
        </label>
        <MoveControl slides={slides} slideIndex={slideIndex} onMove={onMove} />
      </div>
    );
  }
  return (
    <div className="cms-form">
      <label>
        Question
        <textarea value={block.prompt} onChange={(event) => onChange({ ...block, prompt: event.target.value })} />
      </label>
      {block.options.map((option, index) => (
        <label key={option.id}>
          Option {index + 1}
          <input
            value={option.label}
            onChange={(event) => {
              const options = block.options.map((item) => (item.id === option.id ? { ...item, label: event.target.value } : item));
              onChange({ ...block, options });
            }}
          />
        </label>
      ))}
      <label>
        Correct option
        <select value={block.correctId} onChange={(event) => onChange({ ...block, correctId: event.target.value })}>
          {block.options.map((option, index) => (
            <option key={option.id} value={option.id}>
              Option {index + 1}
            </option>
          ))}
        </select>
      </label>
      <label>
        Explanation
        <textarea value={block.explanation} onChange={(event) => onChange({ ...block, explanation: event.target.value })} />
      </label>
      <MoveControl slides={slides} slideIndex={slideIndex} onMove={onMove} />
    </div>
  );
}

function MoveControl({ slides, slideIndex, onMove }: { slides: Slide[]; slideIndex: number; onMove: (index: number) => void }) {
  return (
    <label>
      Move to slide
      <select value={String(slideIndex)} onChange={(event) => onMove(Number(event.target.value))}>
        {slides.map((item, index) => (
          <option key={item.id} value={index}>
            {item.title || `Slide ${index + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}
