"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChevronDown, Redo2, Undo2 } from "lucide-react";
import { ResearchAssistant } from "@/app/components/assist/ResearchAssistant";
import { SlideStage } from "@/app/components/learn/SlideStage";
import { LessonStatusNote, LessonWorkflowButtons } from "@/app/components/cms/LessonWorkflow";
import BrandLogo from "@/app/components/ui/BrandLogo";
import {
  BLOCK_TYPE_LABELS,
  duplicateBlock,
  duplicateSlide,
  emptyBlock,
  emptyResource,
  emptySlide,
  initialRevealCount,
  minRevealCount,
  splitTextBlock,
  unitsForSlide,
  type BlockType,
  type ContentBlock,
  type RevealUnit,
  type Slide,
  type TextBlock,
} from "@/lib/content";
import {
  createLesson,
  deleteLesson,
  loadChapters,
  loadLesson,
  loadLessons,
  loadModules,
  lessonEditorHref,
  lessonReturnPath,
  loadScope,
  saveLessonContent,
  saveLessonMeta,
  statusLabel,
  uploadLessonMedia,
  type AdminChapter,
  type AdminLesson,
  type AdminModule,
} from "@/lib/cms";
import { checkLessonQuality } from "@/lib/authoring";
import { qualityWarnings } from "@/lib/quality";
import { AuthoringTools } from "./AuthoringTools";
import { BlockEditor } from "./BlockEditor";
import { BlockPalette, type PalettePick } from "./BlockPalette";
import { SlideNavigator } from "./SlideNavigator";
import { StudentPreview } from "./StudentPreview";
import { SubmitChecklist } from "./SubmitChecklist";
import { ANIMATIONS, StudioInspector } from "./StudioInspector";

type Snapshot = {
  title: string;
  description: string;
  objectives: string;
  duration: string;
  difficulty: string;
  moduleId: string;
  chapterId: string;
  slides: Slide[];
};

const MODES = [
  { id: "presentation", label: "Presentation" },
  { id: "notes", label: "Full notes" },
  { id: "blocks", label: "Block editor" },
] as const;

export default function LessonStudio({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const backHref = lessonReturnPath(useSearchParams().get("from"));
  const [modules, setModules] = useState<AdminModule[]>([]);
  const [chapters, setChapters] = useState<AdminChapter[]>([]);
  const [siblings, setSiblings] = useState<AdminLesson[]>([]);
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
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [canvasMode, setCanvasMode] = useState<"presentation" | "notes" | "blocks">("presentation");
  const [previewSize, setPreviewSize] = useState<"phone" | "desktop">("desktop");
  const [authorBusy, setAuthorBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [previewRevealed, setPreviewRevealed] = useState(1);
  const [panel, setPanel] = useState<null | "tree" | "props" | "blocks">(null);
  const [addOpen, setAddOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [dropOver, setDropOver] = useState(false);
  const [dismissedWarnings, setDismissedWarnings] = useState("");
  const [renameTitle, setRenameTitle] = useState(false);
  const history = useRef<Snapshot[]>([]);
  const sentenceFocus = useRef<string | null>(null);
  const future = useRef<Snapshot[]>([]);
  const skipHistory = useRef(false);
  const [historySize, setHistorySize] = useState(0);
  const [futureSize, setFutureSize] = useState(0);
  const [uploading, setUploading] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadKind = useRef<"image" | "video" | "audio" | "file">("image");

  const slide = slides[slideIndex];
  const selected = slide?.blocks.find((item) => item.id === blockId) ?? null;
  const units = useMemo(() => (slide ? unitsForSlide(slide) : []), [slide]);

  useEffect(() => {
    const id = sentenceFocus.current;
    if (!id) return;
    const node = document.querySelector<HTMLInputElement>(`[data-sentence="${id}"]`);
    if (!node) return;
    node.focus();
    sentenceFocus.current = null;
  });
  const snapshot = useCallback(
    (): Snapshot => ({ title, description, objectives, duration, difficulty, moduleId, chapterId, slides }),
    [title, description, objectives, duration, difficulty, moduleId, chapterId, slides],
  );

  function markDirty() {
    setDirty(true);
    setSaveState("idle");
  }

  function syncHistory() {
    setHistorySize(history.current.length);
    setFutureSize(future.current.length);
  }

  function pushHistory() {
    if (skipHistory.current) return;
    history.current = [...history.current.slice(-49), snapshot()];
    future.current = [];
    syncHistory();
  }

  function restore(next: Snapshot) {
    skipHistory.current = true;
    setTitle(next.title);
    setDescription(next.description);
    setObjectives(next.objectives);
    setDuration(next.duration);
    setDifficulty(next.difficulty);
    setModuleId(next.moduleId);
    setChapterId(next.chapterId);
    setSlides(next.slides);
    markDirty();
    queueMicrotask(() => {
      skipHistory.current = false;
    });
  }

  function undo() {
    const previous = history.current.pop();
    if (!previous) return;
    future.current.push(snapshot());
    restore(previous);
    syncHistory();
  }

  function redo() {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(snapshot());
    restore(next);
    syncHistory();
  }

  function updateSlides(next: Slide[]) {
    pushHistory();
    setSlides(next);
    markDirty();
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

  function removeBlock(id: string) {
    if (!slide) return;
    const block = slide.blocks.find((item) => item.id === id);
    if (!block) return;
    const name = block.type === "image" ? "image" : block.type === "video" ? "video" : block.type === "audio" ? "audio" : block.type === "text" ? "text" : "item";
    if (!confirm(`Remove this ${name} from the slide?`)) return;
    patchSlide({ blocks: slide.blocks.filter((item) => item.id !== id) });
    if (blockId === id) setBlockId(null);
  }

  function removeResource(id: string) {
    if (!slide) return;
    if (!confirm("Remove this link from the slide?")) return;
    patchSlide({ resources: (slide.resources ?? []).filter((item) => item.id !== id) });
  }

  function selectSlide(index: number) {
    setSlideIndex(index);
    setBlockId(null);
    setPreviewRevealed(unitsForSlide(slides[index]).length || initialRevealCount(slides[index]));
    setCanvasMode((mode) => (mode === "blocks" ? "blocks" : "presentation"));
    setPanel(null);
  }

  const ACCEPT: Record<"image" | "video" | "audio" | "file", string> = {
    image: "image/jpeg,image/png,image/webp,image/gif",
    video: "video/mp4,video/webm",
    audio: "audio/mpeg,audio/wav,.mp3,.wav",
    file: "application/pdf,image/jpeg,image/png,image/webp,image/gif",
  };

  function pickUpload(kind: "image" | "video" | "audio" | "file") {
    uploadKind.current = kind;
    const input = fileRef.current;
    if (!input) return;
    input.accept = ACCEPT[kind];
    input.click();
  }

  async function placeUpload(file: File, kind: "image" | "video" | "audio" | "file") {
    if (!slide) return;
    setUploading(file.name);
    setError("");
    const result = await uploadLessonMedia(lessonId, file, kind);
    setUploading("");
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (kind === "file") {
      const resource = emptyResource();
      resource.title = result.data.originalName;
      resource.url = result.data.url;
      resource.kind = "file";
      patchSlide({ resources: [...(slide.resources ?? []), resource] });
      setBlockId(null);
      return;
    }
    const block = emptyBlock(kind);
    if (block.type === "image") {
      block.url = result.data.url;
      block.alt = result.data.originalName;
    } else if (block.type === "video") {
      block.url = result.data.url;
      block.title = result.data.originalName;
    } else if (block.type === "audio") {
      block.url = result.data.url;
      block.title = result.data.originalName;
    }
    patchSlide({ blocks: [...slide.blocks, block] });
    setBlockId(block.id);
    setCanvasMode("presentation");
  }

  function onPickedFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void placeUpload(file, uploadKind.current);
  }

  function onDropFiles(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    const type = file.type;
    const kind = type.startsWith("video/") ? "video" : type.startsWith("audio/") ? "audio" : type === "application/pdf" ? "file" : "image";
    void placeUpload(file, kind);
  }

  function sentenceOf(block: TextBlock, unit: RevealUnit) {
    if (block.variant === "list") return block.items[unit.unitIndex] ?? "";
    const pieces = units.filter((item) => item.blockId === block.id && item.kind === "text");
    if (pieces.length > 1) return unit.text ?? "";
    return block.text;
  }

  function writeSentence(block: TextBlock, unit: RevealUnit, value: string) {
    if (block.variant === "list") {
      const items = [...block.items];
      items[unit.unitIndex] = value;
      patchBlock({ ...block, items });
      return;
    }
    const pieces = units.filter((item) => item.blockId === block.id && item.kind === "text");
    if (pieces.length > 1) {
      patchBlock({
        ...block,
        text: pieces.map((item) => (item.id === unit.id ? value : item.text ?? "")).join(" "),
      });
      return;
    }
    patchBlock({ ...block, text: value });
  }

  function insertSentenceAfter(blockIndex: number) {
    if (!slide) return;
    const block = emptyBlock("text");
    const blocks = [...slide.blocks];
    blocks.splice(Math.max(blockIndex + 1, 0), 0, block);
    patchSlide({ blocks });
    setBlockId(block.id);
    setPreviewRevealed(unitsForSlide({ ...slide, blocks }).length);
    sentenceFocus.current = `${block.id}:0`;
  }

  function acceptSlides(next: Slide[], nextStatus?: string) {
    pushHistory();
    const slidesNext = next.length ? next : [emptySlide(1)];
    setSlides(slidesNext);
    setDirty(false);
    setSaveState("saved");
    if (nextStatus) setStatus(nextStatus);
    setSlideIndex((index) => Math.min(index, slidesNext.length - 1));
    setPreviewRevealed(unitsForSlide(slidesNext[Math.min(slideIndex, slidesNext.length - 1)]).length || 1);
  }

  function addBlock(type: BlockType, extras?: Partial<ContentBlock>) {
    if (!slide) return;
    const base = emptyBlock(type);
    const block = { ...base, ...extras, id: base.id, type: base.type } as ContentBlock;
    patchSlide({ blocks: [...slide.blocks, block] });
    setBlockId(block.id);
    setCanvasMode((mode) => (mode === "blocks" ? "blocks" : "presentation"));
    setPreviewRevealed(unitsForSlide({ ...slide, blocks: [...slide.blocks, block] }).length);
  }

  function addTemplatedSlide(kind: "slide" | "quiz" | "case" | "audio" | "summary") {
    const nextSlide = emptySlide(slides.length + 1);
    if (kind === "quiz") {
      nextSlide.title = "Knowledge check";
      nextSlide.layout = "assessment";
      nextSlide.blocks = [emptyBlock("check")];
    } else if (kind === "case") {
      nextSlide.title = "Case study";
      nextSlide.layout = "case";
      nextSlide.blocks = [
        { ...emptyBlock("text"), variant: "heading", text: "Case study" } as ContentBlock,
        { ...emptyBlock("text"), text: "Describe the organisation, the problem, and the decision the student must make." } as ContentBlock,
      ];
    } else if (kind === "audio") {
      nextSlide.title = "Audio note";
      nextSlide.blocks = [emptyBlock("audio")];
    } else if (kind === "summary") {
      nextSlide.title = "Lesson summary";
      nextSlide.layout = "summary";
      nextSlide.blocks = [{ ...emptyBlock("text"), variant: "heading", text: "Summary" } as ContentBlock];
    }
    const next = [...slides, nextSlide];
    updateSlides(next);
    setSlideIndex(next.length - 1);
    setAddOpen(false);
  }

  function duplicateAt(index: number) {
    const source = slides[index];
    if (!source) return;
    const copy = duplicateSlide(source);
    const next = [...slides];
    next.splice(index + 1, 0, copy);
    updateSlides(next);
    setSlideIndex(index + 1);
    setBlockId(null);
  }

  function deleteAt(index: number) {
    if (slides.length < 2) return;
    const name = slides[index]?.title || `Slide ${index + 1}`;
    if (!confirm(`Delete “${name}”? Publish a new version before students should see the shorter lesson.`)) return;
    const next = slides.filter((_, itemIndex) => itemIndex !== index);
    updateSlides(next);
    setSlideIndex((current) => Math.min(current > index ? current - 1 : current, next.length - 1));
    setBlockId(null);
  }

  function reorderSlides(from: number, to: number) {
    if (from === to || to < 0 || to >= slides.length || from < 0 || from >= slides.length) return;
    const next = [...slides];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    const selectedId = slides[slideIndex]?.id;
    updateSlides(next);
    const nextIndex = next.findIndex((entry) => entry.id === selectedId);
    if (nextIndex >= 0) setSlideIndex(nextIndex);
  }

  function onPalette(pick: PalettePick) {
    if (pick.action === "resource") {
      if (!slide) return;
      patchSlide({ resources: [...(slide.resources ?? []), emptyResource()] });
      setBlockId(null);
      return;
    }
    if (pick.action === "activity") {
      addBlock("callout", { tone: "important", text: "Activity: ask students to apply this idea." } as Partial<ContentBlock>);
      return;
    }
    addBlock(pick.type);
  }

  function allowFileDrag(event: DragEvent<HTMLElement>) {
    if (![...event.dataTransfer.types].includes("Files")) return;
    event.preventDefault();
    setDropOver(true);
  }

  function leaveFileDrag(event: DragEvent<HTMLElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setDropOver(false);
  }

  function dropFiles(event: DragEvent<HTMLElement>) {
    setDropOver(false);
    onDropFiles(event);
  }

  function onModeKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    const index = MODES.findIndex((item) => item.id === canvasMode);
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = MODES[(index + direction + MODES.length) % MODES.length];
    setCanvasMode(next.id);
  }

  useEffect(() => {
    loadLesson(lessonId).then((result) => {
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
      const nextSlides = item.slides?.length ? item.slides : [emptySlide(1)];
      setSlides(nextSlides);
      setPreviewRevealed(unitsForSlide(nextSlides[0]).length || 1);
      setStatus(item.status);
      setLoaded(true);
    });
    loadModules().then((result) => {
      if (result.ok) setModules(result.data);
    });
    loadScope().then((result) => {
      if (result.ok) setCanPublish(result.data.canPublish);
    });
  }, [lessonId]);

  useEffect(() => {
    if (!moduleId) return;
    loadChapters(moduleId).then((result) => {
      if (result.ok) setChapters(result.data);
    });
    loadLessons(moduleId).then((result) => {
      if (result.ok) setSiblings(result.data);
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

  const saveAll = useCallback(async () => {
    setSaveState("saving");
    setError("");
    const meta = await saveLessonMeta(lessonId, {
      title,
      description,
      objectives: objectives
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      durationMinutes: Number(duration) || null,
      difficulty,
      moduleId,
      chapterId: chapterId || null,
    });
    if (!meta.ok) {
      setSaveState("error");
      setError(meta.message);
      return false;
    }
    const content = await saveLessonContent(lessonId, slides);
    if (!content.ok) {
      setSaveState("error");
      setError(content.message);
      return false;
    }
    setDirty(false);
    setSaveState("saved");
    return true;
  }, [lessonId, title, description, objectives, duration, difficulty, moduleId, chapterId, slides]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if (meta && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
      if (meta && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveAll();
      }
      if (event.key === "Delete" && blockId) {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
        event.preventDefault();
        removeBlock(blockId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!loaded || !dirty) return;
    const timer = window.setTimeout(() => {
      void saveAll();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [loaded, dirty, saveAll]);

  const currentModule = modules.find((item) => item.id === moduleId);
  const courseLabel = currentModule ? `${currentModule.code}: ${currentModule.name}` : "Course";
  const lessonNumber = Math.max(siblings.findIndex((item) => item.id === lessonId) + 1, 1);
  const q = query.trim().toLowerCase();
  const saveLabel =
    saveState === "saving"
      ? "Saving changes..."
      : saveState === "error"
        ? "Unable to save. Retry."
        : saveState === "saved" || !dirty
          ? "All changes saved"
          : "Unsaved changes";

  function matchesQuery(...parts: string[]) {
    if (!q) return true;
    return parts.join(" ").toLowerCase().includes(q);
  }

  const warnings = qualityWarnings(slides);
  const warningSig = warnings.map((item) => `${item.code}:${item.slideId}:${item.blockId}:${item.message}`).join("|");
  const visibleSlides = slides
    .map((entry, index) => ({ slide: entry, index }))
    .filter(({ slide: entry }) => matchesQuery(entry.title, ...entry.blocks.map((block) => BLOCK_TYPE_LABELS[block.type])));

  return (
    <div className="studio">
      <header className="studio-top">
        <BrandLogo href="/admin/lessons" className="studio-brand" />
        <div className="studio-title">
          {renameTitle ? (
            <input
              value={title}
              autoFocus
              aria-label="Lesson title"
              onChange={(event) => {
                pushHistory();
                setTitle(event.target.value);
                markDirty();
              }}
              onBlur={() => setRenameTitle(false)}
              onKeyDown={(event) => event.key === "Enter" && setRenameTitle(false)}
            />
          ) : (
            <button type="button" className="studio-title-btn" onClick={() => setRenameTitle(true)}>
              Lesson {lessonNumber}: {title || "Untitled lesson"}
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" className="studio-file-input" tabIndex={-1} onChange={onPickedFile} />
        <div className="studio-tools">
          <span className={`studio-status is-${status.toLowerCase()} is-save-${saveState}`} aria-live="polite">
            <span className="studio-status-dot" aria-hidden="true" />
            {statusLabel(status)}
            <span className="studio-status-sep" aria-hidden="true">
              ·
            </span>
            {saveLabel}
          </span>
          <div className="studio-history">
            <button type="button" className="studio-icon-btn" onClick={undo} disabled={!historySize} aria-label="Undo">
              <Undo2 size={16} aria-hidden="true" />
            </button>
            <button type="button" className="studio-icon-btn" onClick={redo} disabled={!futureSize} aria-label="Redo">
              <Redo2 size={16} aria-hidden="true" />
            </button>
          </div>
          {uploading ? <span className="studio-save is-saving">Uploading {uploading}…</span> : null}
          <div className="studio-actions">
          <Link className="studio-btn-preview" href={`/learn/lessons/${lessonId}?preview=1`} target="_blank">
            Preview
          </Link>
          <button type="button" className="studio-btn-draft" onClick={() => void saveAll()}>
            Save draft
          </button>
          <LessonWorkflowButtons
            lessonId={lessonId}
            status={status}
            canPublish={canPublish}
            beforeAction={async () => {
              const saved = await saveAll();
              if (!saved) return false;
              const quality = await checkLessonQuality(lessonId, slides);
              if (!quality.ok || !quality.data.length) return true;
              return confirm(`${quality.data.map((item) => item.message).join("\n")}\n\nContinue anyway?`);
            }}
            onDone={setStatus}
            onError={setError}
          />
          {status !== "PUBLISHED" ? (
            <button
              type="button"
              className="studio-btn-delete"
              onClick={async () => {
                const waiting = status === "IN_REVIEW";
                const ok = confirm(
                  waiting
                    ? `“${title || "Untitled lesson"}” is waiting for review. Delete this draft anyway? This cannot be undone.`
                    : `Delete draft “${title || "Untitled lesson"}”? This cannot be undone.`,
                );
                if (!ok) return;
                const result = await deleteLesson(lessonId);
                if (!result.ok) {
                  setError(result.message);
                  return;
                }
                window.location.assign(backHref);
              }}
            >
              Delete draft
            </button>
          ) : null}
          </div>
        </div>
      </header>
      {error ? (
        <p className="cms-error studio-banner">
          {error}{" "}
          {saveState === "error" ? (
            <button type="button" onClick={() => void saveAll()}>
              Retry
            </button>
          ) : null}
        </p>
      ) : null}
      {notice ? <p className="cms-ok studio-banner">{notice}</p> : null}
      <LessonStatusNote status={status} />
      <div className="studio-mobile">
        <button type="button" onClick={() => setPanel(panel === "tree" ? null : "tree")}>
          Lesson structure
        </button>
        <button type="button" onClick={() => setPanel(panel === "props" ? null : "props")}>
          Properties
        </button>
        <button type="button" onClick={() => setPanel(panel === "blocks" ? null : "blocks")}>
          Blocks
        </button>
      </div>
      <div className="studio-body">
        <aside className={`studio-tree${panel === "tree" ? " is-open" : ""}`}>
          <div className="studio-tree-head">
            <h2>Lesson Structure</h2>
            <Link href={backHref} aria-label="Close studio">
              ×
            </Link>
          </div>
          <label className="studio-search">
            <span className="sr-only">Search content</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search content" />
          </label>
          <div className="studio-tree-scroll">
            <details open>
              <summary className="studio-course">{courseLabel}</summary>
              {chapters.map((chapter, unitIndex) => {
                const unitLessons = siblings.filter((item) => item.chapterId === chapter.id);
                if (q && !matchesQuery(chapter.title, ...unitLessons.map((item) => item.title))) return null;
                return (
                  <details key={chapter.id} open={chapter.id === chapterId || !chapterId} className="studio-unit">
                    <summary>
                      Unit {unitIndex + 1}: {chapter.title}
                    </summary>
                    {unitLessons.map((item, lessonIndex) => (
                      <div key={item.id} className={`studio-lesson${item.id === lessonId ? " is-current" : ""}`}>
                        {item.id === lessonId ? (
                          <strong>
                            Lesson {lessonIndex + 1}: {item.title}
                          </strong>
                        ) : (
                          <Link href={lessonEditorHref(item.id, backHref)}>
                            Lesson {lessonIndex + 1}: {item.title}
                          </Link>
                        )}
                      </div>
                    ))}
                  </details>
                );
              })}
              {siblings.some((item) => !item.chapterId) ? (
                <details open className="studio-unit">
                  <summary>Unassigned</summary>
                  {siblings
                    .filter((item) => !item.chapterId)
                    .map((item) => (
                      <div key={item.id} className={`studio-lesson${item.id === lessonId ? " is-current" : ""}`}>
                        {item.id === lessonId ? <strong>{item.title}</strong> : <Link href={lessonEditorHref(item.id, backHref)}>{item.title}</Link>}
                      </div>
                    ))}
                </details>
              ) : null}
            </details>
          </div>
          <SlideNavigator
            slides={visibleSlides}
            total={slides.length}
            slideIndex={slideIndex}
            onSelect={selectSlide}
            onAdd={() => addTemplatedSlide("slide")}
            onDuplicate={duplicateAt}
            onDelete={deleteAt}
            onReorder={reorderSlides}
          />
          <div className="studio-add-wrap">
            <button type="button" className="studio-add-new" onClick={() => setAddOpen((open) => !open)}>
              + Add New
            </button>
            {addOpen ? (
              <div className="studio-add-menu">
                <button type="button" onClick={() => addTemplatedSlide("slide")}>
                  Slide
                </button>
                <button type="button" onClick={() => addTemplatedSlide("quiz")}>
                  Quiz
                </button>
                <button type="button" onClick={() => addTemplatedSlide("case")}>
                  Case study
                </button>
                <button type="button" onClick={() => addTemplatedSlide("audio")}>
                  Audio note
                </button>
                <button type="button" onClick={() => addTemplatedSlide("summary")}>
                  Summary
                </button>
                <button type="button" onClick={() => addBlock("image")}>
                  Image from URL
                </button>
                <button type="button" onClick={() => addBlock("video")}>
                  Video from URL
                </button>
                <button type="button" onClick={() => addBlock("audio")}>
                  Audio from URL
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!slide) return;
                    patchSlide({ resources: [...(slide.resources ?? []), emptyResource()] });
                    setBlockId(null);
                    setAddOpen(false);
                  }}
                >
                  Resource
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!moduleId) return;
                    const created = await createLesson({
                      title: "New lesson",
                      description: "",
                      objectives: [],
                      durationMinutes: 15,
                      difficulty: "beginner",
                      moduleId,
                      chapterId: chapterId || null,
                    });
                    if (!created.ok) {
                      setError(created.message);
                      return;
                    }
                    router.push(lessonEditorHref(created.data.item.id, backHref));
                  }}
                >
                  Lesson
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (slides.length < 2) return;
                    if (!confirm("Delete this slide? Publish a new version before students should see the shorter lesson.")) return;
                    const next = slides.filter((_, index) => index !== slideIndex);
                    updateSlides(next);
                    setSlideIndex(Math.max(0, slideIndex - 1));
                    setAddOpen(false);
                  }}
                >
                  Delete slide
                </button>
              </div>
            ) : null}
          </div>
          <ul className="studio-legend">
            <li>
              <i className="is-published" /> Published
            </li>
            <li>
              <i className="is-draft" /> Draft
            </li>
            <li>
              <i className="is-review" /> In review
            </li>
            <li>
              <i className="is-attention" /> Needs attention
            </li>
          </ul>
          <p className="studio-autosave">Autosave is {saveState === "saving" ? "saving" : "ON"}</p>
        </aside>
        <section className="studio-main">
          {slide ? (
            <>
              <div className="studio-generate">
                <button
                  type="button"
                  className="studio-generate-toggle"
                  aria-expanded={generateOpen}
                  onClick={() => setGenerateOpen((open) => !open)}
                >
                  <span>Generate / Import</span>
                  <ChevronDown size={16} aria-hidden="true" className={generateOpen ? "is-open" : undefined} />
                </button>
                {generateOpen ? (
                  <>
                    <AuthoringTools
                      lessonId={lessonId}
                      moduleId={moduleId}
                      modules={modules}
                      slides={slides}
                      busy={authorBusy}
                      onBusy={setAuthorBusy}
                      onSlides={acceptSlides}
                      onMessage={setNotice}
                      onError={setError}
                    />
                    <ResearchAssistant modules={modules} initialModuleId={moduleId} />
                  </>
                ) : null}
              </div>
              {dismissedWarnings !== warningSig ? (
                <SubmitChecklist warnings={warnings} onDismiss={() => setDismissedWarnings(warningSig)} />
              ) : null}
              <div className="studio-canvas-bar">
                <div className="studio-pager">
                  <button type="button" onClick={() => slideIndex > 0 && selectSlide(slideIndex - 1)} disabled={slideIndex === 0} aria-label="Previous slide">
                    ‹
                  </button>
                  <span>
                    Slide {slideIndex + 1} of {slides.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => slideIndex < slides.length - 1 && selectSlide(slideIndex + 1)}
                    disabled={slideIndex >= slides.length - 1}
                    aria-label="Next slide"
                  >
                    ›
                  </button>
                </div>
                <div className="studio-mode" role="tablist" aria-label="View mode" onKeyDown={onModeKey}>
                  {MODES.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      role="tab"
                      id={`studio-mode-${mode.id}`}
                      aria-selected={canvasMode === mode.id}
                      tabIndex={canvasMode === mode.id ? 0 : -1}
                      className={canvasMode === mode.id ? "is-on" : undefined}
                      onClick={() => setCanvasMode(mode.id)}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
                <span className="studio-etime">Estimated time: {slide.estimatedMinutes ?? duration} min</span>
                <div className="studio-upload-actions">
                  <button type="button" onClick={() => pickUpload("image")}>
                    Upload image
                  </button>
                  <button type="button" onClick={() => pickUpload("video")}>
                    Upload video
                  </button>
                  <button type="button" onClick={() => pickUpload("audio")}>
                    Upload audio
                  </button>
                </div>
              </div>
              {canvasMode === "blocks" ? (
                <div className={`studio-editor-split${dropOver ? " is-drop" : ""}`} onDragEnter={allowFileDrag} onDragOver={allowFileDrag} onDragLeave={leaveFileDrag} onDrop={dropFiles}>
                  <BlockEditor blocks={slide.blocks} onChange={(blocks) => patchSlide({ blocks })} />
                  <StudentPreview slide={slide} size={previewSize} onSize={setPreviewSize} />
                  {dropOver ? <p className="studio-drop-banner">Drop to add this file to the slide</p> : null}
                </div>
              ) : (
              <div className={`studio-canvas${previewSize === "phone" ? " is-phone" : ""}${dropOver ? " is-drop" : ""}`} onDragEnter={allowFileDrag} onDragOver={allowFileDrag} onDragLeave={leaveFileDrag} onDrop={dropFiles}>
                {dropOver ? <p className="studio-drop-banner">Drop to add this file to the slide</p> : null}
                <SlideStage
                  slide={slide}
                  revealed={canvasMode === "notes" ? units.length : previewRevealed}
                  notes={canvasMode === "notes"}
                  numbered={canvasMode === "presentation"}
                  interactive={canvasMode === "presentation" && slide.clickToAdvance !== false}
                  onAdvance={() => setPreviewRevealed((count) => Math.min(count + 1, units.length))}
                  selectedId={blockId}
                  onSelect={setBlockId}
                  onRemove={removeBlock}
                />
                {(slide.resources ?? []).some((item) => item.title || item.url) ? (
                  <ul className="studio-link-list">
                    {(slide.resources ?? [])
                      .filter((item) => item.title || item.url)
                      .map((item) => (
                        <li key={item.id}>
                          <span>{item.title || item.url}</span>
                          <button type="button" onClick={() => removeResource(item.id)}>
                            Remove link
                          </button>
                        </li>
                      ))}
                  </ul>
                ) : null}
                <p className="studio-brand-mark">ExamsPrep</p>
              </div>
              )}
              {canvasMode === "presentation" ? (
                <div className="studio-point-nav">
                  <button type="button" onClick={() => setPreviewRevealed((count) => Math.max(minRevealCount(slide), count - 1))}>
                    ‹ Previous Point
                  </button>
                  <span>
                    {Math.min(previewRevealed, Math.max(units.length, 1))} / {Math.max(units.length, 1)}
                  </span>
                  <button
                    type="button"
                    className="studio-next-point"
                    onClick={() => setPreviewRevealed((count) => Math.min(count + 1, units.length))}
                  >
                    Next Point ›
                  </button>
                </div>
              ) : null}
              <div className="studio-sequence">
                <div className="studio-sequence-head">
                  <h3>Reveal Sequence (Slide {slideIndex + 1})</h3>
                  <div>
                    <button type="button" onClick={() => setPreviewRevealed(initialRevealCount(slide))}>
                      Preview Sequence
                    </button>
                    <button type="button" onClick={() => setPreviewRevealed(units.length)}>
                      Reveal All
                    </button>
                  </div>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Type</th>
                      <th>Content Preview</th>
                      <th>Animation</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((unit, index) => {
                      const block = slide.blocks[unit.blockIndex];
                      return (
                        <tr key={unit.id} className={blockId === unit.blockId ? "is-on" : undefined}>
                          <td>{index + 1}</td>
                          <td>
                            <button type="button" className="studio-type-chip" onClick={() => setBlockId(unit.blockId)}>
                              {glyph(unit.type)}
                            </button>
                          </td>
                          <td>
                            {block?.type === "text" ? (
                              <input
                                className="studio-sentence"
                                data-sentence={unit.id}
                                aria-label={`Sentence ${index + 1}`}
                                placeholder="Type a sentence"
                                value={sentenceOf(block, unit)}
                                onFocus={() => setBlockId(unit.blockId)}
                                onChange={(event) => writeSentence(block, unit, event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key !== "Enter") return;
                                  event.preventDefault();
                                  insertSentenceAfter(unit.blockIndex);
                                }}
                              />
                            ) : (
                              <button type="button" className="cms-plain" onClick={() => setBlockId(unit.blockId)}>
                                {unit.preview}
                              </button>
                            )}
                          </td>
                          <td>{ANIMATIONS.find((item) => item.id === unit.animation)?.label || "Fade In"}</td>
                          <td>
                            <button
                              type="button"
                              aria-label="Duplicate"
                              onClick={() => {
                                const copy = duplicateBlock(block);
                                patchSlide({
                                  blocks: [...slide.blocks.slice(0, unit.blockIndex + 1), copy, ...slide.blocks.slice(unit.blockIndex + 1)],
                                });
                                setBlockId(copy.id);
                              }}
                            >
                              ⧉
                            </button>
                            {block.type === "text" ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const pieces = splitTextBlock(block as TextBlock);
                                  if (pieces.length < 2) return;
                                  patchSlide({
                                    blocks: [...slide.blocks.slice(0, unit.blockIndex), ...pieces, ...slide.blocks.slice(unit.blockIndex + 1)],
                                    revealMode: "block",
                                  });
                                }}
                              >
                                Split
                              </button>
                            ) : null}
                            <button type="button" onClick={() => removeBlock(block.id)}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button type="button" className="studio-add-reveal" onClick={() => insertSentenceAfter((slide.blocks.length || 1) - 1)}>
                  + Add sentence
                </button>
              </div>
            </>
          ) : null}
        </section>
        <aside className={`studio-props${panel === "props" ? " is-open" : ""}`}>
          <StudioInspector
            lessonId={lessonId}
            slide={slide}
            selected={selected}
            slides={slides}
            slideIndex={slideIndex}
            duration={duration}
            onSlide={patchSlide}
            onBlock={patchBlock}
            onClearSelection={() => setBlockId(null)}
            onRemoveBlock={removeBlock}
            onMoveBlock={(nextIndex) => {
              if (!slide || !selected) return;
              const without = slide.blocks.filter((item) => item.id !== selected.id);
              updateSlides(
                slides.map((item, index) => {
                  if (index === slideIndex) return { ...item, blocks: without };
                  if (index === nextIndex) return { ...item, blocks: [...item.blocks, selected] };
                  return item;
                }),
              );
              setSlideIndex(nextIndex);
            }}
          />
        </aside>
        <aside className={`studio-palette${panel === "blocks" ? " is-open" : ""}`} aria-label="Content">
          <BlockPalette onPick={onPalette} />
        </aside>
      </div>
    </div>
  );
}

function glyph(type: BlockType | string) {
  switch (type) {
    case "image":
      return "▣";
    case "video":
      return "▶";
    case "audio":
      return "♪";
    case "table":
      return "▦";
    case "code":
      return "</>";
    case "check":
      return "?";
    case "callout":
      return "!";
    default:
      return "T";
  }
}
