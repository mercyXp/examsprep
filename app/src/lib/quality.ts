import type { ContentBlock, Slide } from "@/lib/content";

export type QualityWarning = {
  code: "empty_slide" | "empty_lesson" | "missing_answer" | "broken_image";
  message: string;
  slideId: string;
  blockId: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hasContent(block: ContentBlock) {
  if (block.type === "text") return Boolean(text(block.text) || block.items.some((item) => text(item)));
  if (block.type === "code") return Boolean(text(block.code));
  if (block.type === "image") return Boolean(text(block.url));
  if (block.type === "callout") return Boolean(text(block.text));
  if (block.type === "video") return Boolean(text(block.url) || text(block.title));
  if (block.type === "audio") return Boolean(text(block.url) || text(block.transcript));
  if (block.type === "table") return Boolean(text(block.caption) || block.rows.some((row) => row.some((cell) => text(cell))));
  if (block.type === "check" || block.type === "quiz") return Boolean(text(block.prompt));
  if (block.type === "math") return Boolean(text(block.latex));
  if (block.type === "flashcard") return Boolean(text(block.front) || text(block.back));
  if (block.type === "game") {
    return Boolean(
      text(block.title) ||
        text(block.prompt) ||
        block.pairs.some((pair) => text(pair.left) || text(pair.right)) ||
        block.items.some((item) => text(item.label)),
    );
  }
  return false;
}

function imageProblem(url: string) {
  if (!url) return "This image has no file.";
  const lowered = url.toLowerCase();
  if (lowered.startsWith("javascript:") || lowered.startsWith("data:")) return "This image address is not supported.";
  if (!lowered.startsWith("http://") && !lowered.startsWith("https://") && !url.startsWith("/")) return "This image address is not a valid link.";
  return "";
}

export function qualityWarnings(slides: Slide[]): QualityWarning[] {
  const warnings: QualityWarning[] = [];
  if (!slides.length) {
    warnings.push({ code: "empty_lesson", message: "This lesson has no slides.", slideId: "", blockId: "" });
    return warnings;
  }
  slides.forEach((slide, index) => {
    const title = slide.title.trim() || `Slide ${index + 1}`;
    if (!slide.blocks.some(hasContent)) {
      warnings.push({ code: "empty_slide", message: `“${title}” has no content.`, slideId: slide.id, blockId: "" });
    }
    slide.blocks.forEach((block) => {
      if (block.type === "image") {
        const problem = imageProblem(block.url.trim());
        if (problem) warnings.push({ code: "broken_image", message: `“${title}”: ${problem}`, slideId: slide.id, blockId: block.id });
      }
      if ((block.type === "check" || (block.type === "quiz" && block.kind !== "blank")) && text(block.prompt)) {
        const known = new Set(block.options.map((option) => option.id));
        if (!block.correctId || !known.has(block.correctId)) {
          const label = block.type === "check" ? "Knowledge check" : "Quiz";
          warnings.push({
            code: "missing_answer",
            message: `“${title}”: ${label} has no correct answer.`,
            slideId: slide.id,
            blockId: block.id,
          });
        }
      }
      if (block.type === "quiz" && block.kind === "blank" && text(block.prompt) && !text(block.answer)) {
        warnings.push({
          code: "missing_answer",
          message: `“${title}”: Fill-in-the-blank question has no answer.`,
          slideId: slide.id,
          blockId: block.id,
        });
      }
    });
  });
  return warnings;
}
