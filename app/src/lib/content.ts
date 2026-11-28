import { stripRichText } from "@/lib/rich-text";

export type TextVariant = "heading" | "paragraph" | "list" | "definition" | "quote";
export type TextFont = "sans" | "serif" | "mono";
export type CalloutTone = "note" | "tip" | "warning" | "important";
export type BlockType = "text" | "code" | "image" | "callout" | "check" | "video" | "audio" | "table" | "math" | "flashcard" | "quiz" | "game";
export type QuizKind = "mcq" | "blank" | "true_false" | "structured";
export type GameKind = "matching" | "drag";
export type AppearMode = "click" | "immediate";
export type RevealAnimation = "fade" | "none" | "up" | "left" | "right" | "zoom";
export type RevealMode = "block" | "sentence";
export type SlideLayout =
  | "title"
  | "text"
  | "text_image"
  | "image_text"
  | "image"
  | "video"
  | "two_column"
  | "code"
  | "summary"
  | "assessment"
  | "case"
  | "custom";
export type MediaAlign = "left" | "center" | "right";
export type ResourceKind = "link" | "video" | "file" | "textbook";

export type CheckOption = { id: string; label: string };

export type RevealSettings = {
  appear?: AppearMode;
  animation?: RevealAnimation;
  notesOnly?: boolean;
};

export type TextBlock = RevealSettings & {
  id: string;
  type: "text";
  variant: TextVariant;
  text: string;
  items: string[];
  font?: TextFont;
};

export type CodeBlock = RevealSettings & {
  id: string;
  type: "code";
  language: string;
  code: string;
};

export type ImageBlock = RevealSettings & {
  id: string;
  type: "image";
  url: string;
  alt: string;
  caption?: string;
  align?: MediaAlign;
  widthPercent?: number;
};

export type CalloutBlock = RevealSettings & {
  id: string;
  type: "callout";
  tone: CalloutTone;
  text: string;
};

export type CheckBlock = RevealSettings & {
  id: string;
  type: "check";
  prompt: string;
  options: CheckOption[];
  correctId: string;
  explanation: string;
  feedbackCorrect: string;
  feedbackWrong: string;
};

export type VideoBlock = RevealSettings & {
  id: string;
  type: "video";
  url: string;
  title: string;
  caption: string;
};

export type AudioBlock = RevealSettings & {
  id: string;
  type: "audio";
  url: string;
  title: string;
  transcript: string;
};

export type TableBlock = RevealSettings & {
  id: string;
  type: "table";
  caption: string;
  headers: string[];
  rows: string[][];
};

export type MathBlock = RevealSettings & {
  id: string;
  type: "math";
  latex: string;
  caption: string;
};

export type FlashcardBlock = RevealSettings & {
  id: string;
  type: "flashcard";
  front: string;
  back: string;
};

export type QuizBlock = RevealSettings & {
  id: string;
  type: "quiz";
  kind: QuizKind;
  prompt: string;
  options: CheckOption[];
  correctId: string;
  answer: string;
  explanation: string;
};

export type GamePair = { id: string; left: string; right: string };
export type GameItem = { id: string; label: string; bin: string };

export type GameBlock = RevealSettings & {
  id: string;
  type: "game";
  kind: GameKind;
  title: string;
  prompt: string;
  pairs: GamePair[];
  bins: string[];
  items: GameItem[];
};

export type ContentBlock =
  | TextBlock
  | CodeBlock
  | ImageBlock
  | CalloutBlock
  | CheckBlock
  | VideoBlock
  | AudioBlock
  | TableBlock
  | MathBlock
  | FlashcardBlock
  | QuizBlock
  | GameBlock;

export type LessonResource = {
  id: string;
  title: string;
  description: string;
  kind: ResourceKind;
  url: string;
};

export type Slide = {
  id: string;
  title: string;
  blocks: ContentBlock[];
  layout?: SlideLayout;
  revealMode?: RevealMode;
  titleImmediate?: boolean;
  transition?: RevealAnimation;
  background?: string;
  resources?: LessonResource[];
  estimatedMinutes?: number;
  altText?: string;
  requireAllItems?: boolean;
  clickToAdvance?: boolean;
};

export const SLIDE_LAYOUTS: { id: SlideLayout; label: string }[] = [
  { id: "title", label: "Title slide" },
  { id: "text", label: "Text" },
  { id: "text_image", label: "Text and image" },
  { id: "image_text", label: "Image and text" },
  { id: "image", label: "Full-width image" },
  { id: "video", label: "Video lesson" },
  { id: "two_column", label: "Two column" },
  { id: "code", label: "Code example" },
  { id: "summary", label: "Summary" },
  { id: "assessment", label: "Assessment" },
  { id: "case", label: "Case study" },
  { id: "custom", label: "Custom" },
];

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  text: "Text",
  code: "Code",
  image: "Image",
  callout: "Callout",
  check: "Knowledge check",
  video: "Video",
  audio: "Audio note",
  table: "Table",
  math: "Math formula",
  flashcard: "Flashcard",
  quiz: "Quiz",
  game: "Game",
};

export function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function emptySlide(index = 1): Slide {
  return {
    id: newId(),
    title: `Slide ${index}`,
    blocks: [],
    layout: "text",
    revealMode: "block",
    titleImmediate: true,
    transition: "fade",
    background: "",
    resources: [],
    estimatedMinutes: 5,
    altText: "",
    requireAllItems: true,
    clickToAdvance: true,
  };
}

export function emptyResource(): LessonResource {
  return { id: newId(), title: "", description: "", kind: "link", url: "" };
}

export function emptyBlock(type: BlockType): ContentBlock {
  const id = newId();
  const reveal = { appear: "click" as const, animation: "fade" as const, notesOnly: false };
  if (type === "code") return { id, type, language: "sql", code: "", ...reveal };
  if (type === "image") return { id, type, url: "", alt: "", caption: "", align: "center", widthPercent: 100, ...reveal };
  if (type === "callout") return { id, type, tone: "note", text: "", ...reveal };
  if (type === "video") return { id, type, url: "", title: "", caption: "", ...reveal };
  if (type === "audio") return { id, type, url: "", title: "", transcript: "", ...reveal };
  if (type === "table") return { id, type, caption: "", headers: ["Column 1", "Column 2"], rows: [["", ""]], ...reveal };
  if (type === "check") {
    const a = newId();
    const b = newId();
    return {
      id,
      type,
      prompt: "",
      options: [
        { id: a, label: "Option A" },
        { id: b, label: "Option B" },
      ],
      correctId: a,
      explanation: "",
      feedbackCorrect: "",
      feedbackWrong: "",
      ...reveal,
    };
  }
  if (type === "math") return { id, type, latex: "", caption: "", ...reveal };
  if (type === "flashcard") return { id, type, front: "", back: "", ...reveal };
  if (type === "quiz") {
    const a = newId();
    const b = newId();
    return {
      id,
      type,
      kind: "mcq",
      prompt: "",
      options: [
        { id: a, label: "Option A" },
        { id: b, label: "Option B" },
      ],
      correctId: "",
      answer: "",
      explanation: "",
      ...reveal,
    };
  }
  if (type === "game") {
    return {
      id,
      type,
      kind: "matching",
      title: "",
      prompt: "",
      pairs: [
        { id: newId(), left: "", right: "" },
        { id: newId(), left: "", right: "" },
      ],
      bins: ["Concept", "Example"],
      items: [],
      ...reveal,
    };
  }
  return { id, type: "text", variant: "paragraph", text: "", items: [], ...reveal };
}

export function blockFromMenu(kind: "heading" | BlockType): ContentBlock {
  if (kind === "heading") {
    const block = emptyBlock("text");
    if (block.type === "text") block.variant = "heading";
    return block;
  }
  return emptyBlock(kind);
}

export function splitUnits(text: string): string[] {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return [];
  const parts = trimmed.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [trimmed];
  return parts.map((part) => part.trim()).filter(Boolean);
}

export type RevealUnit = {
  id: string;
  blockIndex: number;
  blockId: string;
  kind: "text" | "block";
  unitIndex: number;
  preview: string;
  appear: AppearMode;
  animation: RevealAnimation;
  notesOnly?: boolean;
  text?: string;
  type: BlockType;
};

export function appearOf(block: ContentBlock): AppearMode {
  return block.appear === "immediate" ? "immediate" : "click";
}

export function animationOf(block: ContentBlock): RevealAnimation {
  const value = block.animation;
  if (value === "none" || value === "up" || value === "left" || value === "right" || value === "zoom") return value;
  return "fade";
}

export function revealModeOf(slide: Slide): RevealMode {
  return slide.revealMode === "sentence" ? "sentence" : "block";
}

export function presentationBlocks(slide: Slide) {
  return slide.blocks.map((block, blockIndex) => ({ block, blockIndex })).filter((item) => !item.block.notesOnly);
}

export function unitsForSlide(slide: Slide, { includeNotes = false }: { includeNotes?: boolean } = {}): RevealUnit[] {
  const units: RevealUnit[] = [];
  const mode = revealModeOf(slide);
  slide.blocks.forEach((block, blockIndex) => {
    if (block.notesOnly && !includeNotes) return;
    const appear = appearOf(block);
    const animation = animationOf(block);
    if (block.type === "text") {
      const pieces =
        block.variant === "list"
          ? block.items.map((item) => item.trim()).filter(Boolean)
          : mode === "sentence"
            ? splitUnits(block.text)
            : [block.text.trim()].filter(Boolean);
      if (pieces.length <= 1 && block.variant !== "list") {
        units.push({
          id: `${block.id}:0`,
          blockIndex,
          blockId: block.id,
          kind: "block",
          unitIndex: 0,
          preview: blockPreview(block),
          appear,
          animation,
          notesOnly: block.notesOnly,
          type: block.type,
        });
        return;
      }
      if (pieces.length === 0) {
        units.push({
          id: `${block.id}:0`,
          blockIndex,
          blockId: block.id,
          kind: "block",
          unitIndex: 0,
          preview: blockPreview(block),
          appear,
          animation,
          notesOnly: block.notesOnly,
          type: block.type,
        });
        return;
      }
      pieces.forEach((text, unitIndex) => {
        units.push({
          id: `${block.id}:${unitIndex}`,
          blockIndex,
          blockId: block.id,
          kind: "text",
          unitIndex,
          preview: clip(text),
          appear,
          animation,
          notesOnly: block.notesOnly,
          text,
          type: block.type,
        });
      });
      return;
    }
    units.push({
      id: `${block.id}:0`,
      blockIndex,
      blockId: block.id,
      kind: "block",
      unitIndex: 0,
      preview: blockPreview(block),
      appear,
      animation,
      notesOnly: block.notesOnly,
      type: block.type,
    });
  });
  return units;
}

export function minRevealCount(slide: Slide) {
  const units = unitsForSlide(slide);
  let count = 0;
  for (const unit of units) {
    if (unit.appear === "immediate") count += 1;
    else break;
  }
  return count;
}

export function initialRevealCount(slide?: Slide) {
  if (!slide) return 0;
  const units = unitsForSlide(slide);
  if (!units.length) return 0;
  let count = 0;
  for (const unit of units) {
    count += 1;
    if (unit.appear !== "immediate") break;
  }
  return count;
}

export function blockVisible(units: RevealUnit[], count: number, blockIndex: number) {
  return units.some((unit, index) => index < count && unit.blockIndex === blockIndex);
}

export function revealedForBlock(block: ContentBlock, units: RevealUnit[], count: number, blockIndex: number) {
  if (block.type !== "text") return undefined;
  const owned = units
    .map((unit, index) => ({ unit, index }))
    .filter((item) => item.unit.blockIndex === blockIndex && item.index < count && item.unit.kind === "text");
  if (!owned.length) return undefined;
  if (block.variant === "list") {
    return owned.map((item) => item.unit.text ?? "").join("\n");
  }
  return owned.map((item) => item.unit.text ?? "").join(" ");
}

export function lessonResources(slides: Slide[]) {
  const seen = new Set<string>();
  const items: LessonResource[] = [];
  for (const slide of slides) {
    for (const resource of slide.resources ?? []) {
      if (!resource.title && !resource.url) continue;
      const key = resource.id || `${resource.url}:${resource.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(resource);
    }
  }
  return items;
}

export function blockPreview(block: ContentBlock) {
  if (block.type === "text") {
    if (block.variant === "list") return clip(stripRichText(block.items.filter(Boolean).join(" · ")) || "List");
    return clip(stripRichText(block.text) || block.variant);
  }
  if (block.type === "code") return clip(block.code || `${block.language} code`);
  if (block.type === "image") return clip(block.alt || block.caption || "Image");
  if (block.type === "callout") return clip(stripRichText(block.text) || block.tone);
  if (block.type === "check") return clip(block.prompt || "Knowledge check");
  if (block.type === "video") return clip(block.title || "Video");
  if (block.type === "table") return clip(block.caption || block.headers.join(" · ") || "Table");
  if (block.type === "math") return clip(block.latex || block.caption || "Formula");
  if (block.type === "flashcard") return clip(block.front || "Flashcard");
  if (block.type === "quiz") return clip(block.prompt || (block.kind === "blank" ? "Fill in the blank" : "Quiz"));
  if (block.type === "game") return clip(block.title || block.prompt || "Game");
  return clip(block.title || "Audio note");
}

export function duplicateSlide(slide: Slide): Slide {
  const copy = structuredClone(slide) as Slide;
  copy.id = newId();
  copy.title = slide.title ? `${slide.title} (copy)` : "Slide copy";
  copy.blocks = slide.blocks.map((block) => duplicateBlock(block));
  copy.resources = (slide.resources ?? []).map((item) => ({ ...item, id: newId() }));
  return copy;
}

export function duplicateBlock(block: ContentBlock): ContentBlock {
  const copy = structuredClone(block) as ContentBlock;
  copy.id = newId();
  if (copy.type === "check" || copy.type === "quiz") {
    const mapping: Record<string, string> = {};
    copy.options = copy.options.map((option) => {
      const id = newId();
      mapping[option.id] = id;
      return { ...option, id };
    });
    copy.correctId = mapping[copy.correctId] ?? (copy.type === "check" ? copy.options[0]?.id ?? "" : "");
  }
  if (copy.type === "game") {
    copy.pairs = copy.pairs.map((pair) => ({ ...pair, id: newId() }));
    copy.items = copy.items.map((item) => ({ ...item, id: newId() }));
  }
  return copy;
}

export function splitTextBlock(block: TextBlock): TextBlock[] {
  const pieces = block.variant === "list" ? block.items.map((item) => item.trim()).filter(Boolean) : splitUnits(block.text);
  if (pieces.length < 2) return [block];
  return pieces.map((piece, index) => ({
    ...block,
    id: index === 0 ? block.id : newId(),
    variant: block.variant === "list" ? "paragraph" : block.variant,
    text: piece,
    items: [],
  }));
}

export function mediaEmbed(url: string): { kind: "youtube" | "file"; src: string } | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const youtube = trimmed.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/i);
  if (youtube) return { kind: "youtube", src: `https://www.youtube.com/embed/${youtube[1]}` };
  return { kind: "file", src: trimmed };
}

export function parseSlides(raw: unknown): Slide[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      id: typeof row.id === "string" && row.id ? row.id : newId(),
      title: typeof row.title === "string" && row.title ? row.title : `Slide ${index + 1}`,
      blocks: parseBlocks(row.blocks),
      layout: asLayout(row.layout),
      revealMode: row.revealMode === "sentence" ? "sentence" : "block",
      titleImmediate: row.titleImmediate !== false,
      transition: asAnimation(row.transition),
      background: asText(row.background),
      resources: parseResources(row.resources),
      estimatedMinutes: typeof row.estimatedMinutes === "number" ? row.estimatedMinutes : Number(row.estimatedMinutes) || undefined,
      altText: asText(row.altText ?? row.alt_text),
      requireAllItems: row.requireAllItems !== false,
      clickToAdvance: row.clickToAdvance !== false,
    };
  });
}

function parseBlocks(raw: unknown): ContentBlock[] {
  if (!Array.isArray(raw)) return [];
  const blocks: ContentBlock[] = [];
  for (const item of raw) {
    const parsed = parseBlock(item);
    if (parsed) blocks.push(parsed);
  }
  return blocks;
}

function parseBlock(raw: unknown): ContentBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" && row.id ? row.id : newId();
  const reveal = parseReveal(row);
  const type = row.type;
  if (type === "code") {
    return { id, type, language: asText(row.language) || "text", code: asText(row.code), ...reveal };
  }
  if (type === "image") {
    return {
      id,
      type,
      url: asText(row.url),
      alt: asText(row.alt),
      caption: asText(row.caption),
      align: row.align === "left" || row.align === "right" ? row.align : "center",
      widthPercent: asPercent(row.widthPercent ?? row.width_percent),
      ...reveal,
    };
  }
  if (type === "callout") {
    const tone = row.tone;
    return {
      id,
      type,
      tone: tone === "tip" || tone === "warning" || tone === "important" ? tone : "note",
      text: asText(row.text),
      ...reveal,
    };
  }
  if (type === "check") {
    const options = parseOptions(row.options);
    return {
      id,
      type,
      prompt: asText(row.prompt),
      options,
      correctId: asText(row.correctId) || asText(row.correct_id),
      explanation: asText(row.explanation),
      feedbackCorrect: asText(row.feedbackCorrect) || asText(row.feedback_correct),
      feedbackWrong: asText(row.feedbackWrong) || asText(row.feedback_wrong),
      ...reveal,
    };
  }
  if (type === "video") {
    return { id, type, url: asText(row.url), title: asText(row.title), caption: asText(row.caption), ...reveal };
  }
  if (type === "audio") {
    return { id, type, url: asText(row.url), title: asText(row.title), transcript: asText(row.transcript), ...reveal };
  }
  if (type === "table") {
    const headers = Array.isArray(row.headers) ? row.headers.filter((item): item is string => typeof item === "string") : [];
    const rows = Array.isArray(row.rows)
      ? row.rows
          .filter((item): item is unknown[] => Array.isArray(item))
          .map((item) => item.map((cell) => (typeof cell === "string" ? cell : String(cell ?? ""))))
      : [];
    return { id, type, caption: asText(row.caption), headers, rows, ...reveal };
  }
  if (type === "math") {
    return { id, type, latex: asText(row.latex), caption: asText(row.caption), ...reveal };
  }
  if (type === "flashcard") {
    return { id, type, front: asText(row.front), back: asText(row.back), ...reveal };
  }
  if (type === "quiz") {
    const options = parseOptions(row.options);
    return {
      id,
      type,
      kind: row.kind === "blank" || row.kind === "true_false" || row.kind === "structured" ? row.kind : "mcq",
      prompt: asText(row.prompt),
      options,
      correctId: asText(row.correctId) || asText(row.correct_id),
      answer: asText(row.answer),
      explanation: asText(row.explanation),
      ...reveal,
    };
  }
  if (type === "game") {
    const pairs = Array.isArray(row.pairs)
      ? row.pairs
          .map((pair) => {
            if (!pair || typeof pair !== "object") return null;
            const item = pair as Record<string, unknown>;
            return { id: asText(item.id) || newId(), left: asText(item.left), right: asText(item.right) };
          })
          .filter((pair): pair is { id: string; left: string; right: string } => Boolean(pair))
      : [];
    const bins = Array.isArray(row.bins) ? row.bins.map((item) => asText(item)).filter(Boolean) : ["Concept", "Example"];
    const items = Array.isArray(row.items)
      ? row.items
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const item = entry as Record<string, unknown>;
            return { id: asText(item.id) || newId(), label: asText(item.label), bin: asText(item.bin) };
          })
          .filter((item): item is { id: string; label: string; bin: string } => Boolean(item))
      : [];
    return {
      id,
      type,
      kind: row.kind === "drag" ? "drag" : "matching",
      title: asText(row.title),
      prompt: asText(row.prompt),
      pairs,
      bins: bins.length ? bins : ["Concept", "Example"],
      items,
      ...reveal,
    };
  }
  if (type === "text") {
    const variant = row.variant;
    return {
      id,
      type,
      variant:
        variant === "heading" || variant === "list" || variant === "definition" || variant === "quote"
          ? variant
          : "paragraph",
      text: asText(row.text),
      items: Array.isArray(row.items) ? row.items.filter((item): item is string => typeof item === "string") : [],
      font: row.font === "serif" || row.font === "mono" ? row.font : "sans",
      ...reveal,
    };
  }
  return null;
}

function parseOptions(raw: unknown): CheckOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((option) => {
      if (!option || typeof option !== "object") return null;
      const item = option as Record<string, unknown>;
      return { id: asText(item.id) || newId(), label: asText(item.label) };
    })
    .filter((option): option is CheckOption => Boolean(option));
}

function parseReveal(row: Record<string, unknown>): RevealSettings {
  return {
    appear: row.appear === "immediate" ? "immediate" : "click",
    animation: asAnimation(row.animation),
    notesOnly: Boolean(row.notesOnly ?? row.notes_only),
  };
}

function parseResources(raw: unknown): LessonResource[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const kind = row.kind;
      return {
        id: asText(row.id) || newId(),
        title: asText(row.title),
        description: asText(row.description),
        kind: kind === "video" || kind === "file" || kind === "textbook" ? kind : "link",
        url: asText(row.url),
      };
    })
    .filter((item): item is LessonResource => Boolean(item));
}

function asLayout(value: unknown): SlideLayout {
  const allowed = SLIDE_LAYOUTS.map((item) => item.id);
  return typeof value === "string" && allowed.includes(value as SlideLayout) ? (value as SlideLayout) : "text";
}

function asAnimation(value: unknown): RevealAnimation {
  if (value === "none" || value === "up" || value === "left" || value === "right" || value === "zoom" || value === "fade") {
    return value;
  }
  return "fade";
}

function asPercent(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 100;
  return Math.min(100, Math.max(20, Math.round(number)));
}

function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function clip(value: string, length = 72) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= length) return trimmed || "Empty item";
  return `${trimmed.slice(0, length - 1)}…`;
}
