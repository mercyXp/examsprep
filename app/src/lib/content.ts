export type TextVariant = "heading" | "paragraph" | "list" | "definition";
export type CalloutTone = "note" | "tip" | "warning" | "important";
export type BlockType = "text" | "code" | "image" | "callout" | "check";

export type CheckOption = { id: string; label: string };

export type TextBlock = {
  id: string;
  type: "text";
  variant: TextVariant;
  text: string;
  items: string[];
};

export type CodeBlock = {
  id: string;
  type: "code";
  language: string;
  code: string;
};

export type ImageBlock = {
  id: string;
  type: "image";
  url: string;
  alt: string;
};

export type CalloutBlock = {
  id: string;
  type: "callout";
  tone: CalloutTone;
  text: string;
};

export type CheckBlock = {
  id: string;
  type: "check";
  prompt: string;
  options: CheckOption[];
  correctId: string;
  explanation: string;
  feedbackCorrect: string;
  feedbackWrong: string;
};

export type ContentBlock = TextBlock | CodeBlock | ImageBlock | CalloutBlock | CheckBlock;

export type Slide = {
  id: string;
  title: string;
  blocks: ContentBlock[];
};

export function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function emptySlide(index = 1): Slide {
  return { id: newId(), title: `Slide ${index}`, blocks: [] };
}

export function emptyBlock(type: BlockType): ContentBlock {
  const id = newId();
  if (type === "code") return { id, type, language: "sql", code: "" };
  if (type === "image") return { id, type, url: "", alt: "" };
  if (type === "callout") return { id, type, tone: "note", text: "" };
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
    };
  }
  return { id, type: "text", variant: "paragraph", text: "", items: [] };
}

export function splitUnits(text: string): string[] {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return [];
  const parts = trimmed.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [trimmed];
  return parts.map((part) => part.trim()).filter(Boolean);
}

export type RevealUnit =
  | { kind: "text"; blockIndex: number; unitIndex: number; text: string }
  | { kind: "block"; blockIndex: number };

export function unitsForSlide(slide: Slide): RevealUnit[] {
  const units: RevealUnit[] = [];
  slide.blocks.forEach((block, blockIndex) => {
    if (block.type === "text") {
      const source = block.variant === "list" ? block.items : [block.text];
      const sentences = source.flatMap((item) => splitUnits(item));
      if (sentences.length === 0) {
        units.push({ kind: "block", blockIndex });
        return;
      }
      sentences.forEach((text, unitIndex) => {
        units.push({ kind: "text", blockIndex, unitIndex, text });
      });
      return;
    }
    units.push({ kind: "block", blockIndex });
  });
  return units;
}

export function parseSlides(raw: unknown): Slide[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      id: typeof row.id === "string" && row.id ? row.id : newId(),
      title: typeof row.title === "string" && row.title ? row.title : `Slide ${index + 1}`,
      blocks: parseBlocks(row.blocks),
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
  const type = row.type;
  if (type === "code") {
    return { id, type, language: asText(row.language) || "text", code: asText(row.code) };
  }
  if (type === "image") {
    return { id, type, url: asText(row.url), alt: asText(row.alt) };
  }
  if (type === "callout") {
    const tone = row.tone;
    return {
      id,
      type,
      tone: tone === "tip" || tone === "warning" || tone === "important" ? tone : "note",
      text: asText(row.text),
    };
  }
  if (type === "check") {
    const options = Array.isArray(row.options)
      ? row.options
          .map((option) => {
            if (!option || typeof option !== "object") return null;
            const item = option as Record<string, unknown>;
            return { id: asText(item.id) || newId(), label: asText(item.label) };
          })
          .filter((option): option is CheckOption => Boolean(option))
      : [];
    return {
      id,
      type,
      prompt: asText(row.prompt),
      options,
      correctId: asText(row.correctId) || asText(row.correct_id),
      explanation: asText(row.explanation),
      feedbackCorrect: asText(row.feedbackCorrect) || asText(row.feedback_correct),
      feedbackWrong: asText(row.feedbackWrong) || asText(row.feedback_wrong),
    };
  }
  if (type === "text") {
    const variant = row.variant;
    return {
      id,
      type: "text",
      variant: variant === "heading" || variant === "list" || variant === "definition" ? variant : "paragraph",
      text: asText(row.text),
      items: Array.isArray(row.items) ? row.items.filter((item): item is string => typeof item === "string") : [],
    };
  }
  return null;
}

function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}
