import { api } from "@/lib/api";
import { parseSlides, type ContentBlock, type Slide } from "@/lib/content";
import type { AdminLesson } from "@/lib/cms";

export type AuthoringProvider = {
  provider: string;
  configured: boolean;
  model: string;
};

export type LessonTemplate = {
  id: string;
  label: string;
  description: string;
};

export type BankQuestion = {
  id: string;
  moduleId: string;
  title: string;
  prompt: string;
  kind: string;
  source: string;
  status: string;
  topicId: string | null;
  topicTitle: string;
  pastPaperId: string | null;
  paperLabel: string;
  choices: { id: string; label: string }[];
  correctOptionIds: string[];
  acceptedAnswers: string[];
  explanation: string;
  modelAnswer: string;
  warnings: string[];
};

export type PastPaper = {
  id: string;
  moduleId: string;
  title: string;
  filename: string;
  year: number | null;
  status: string;
  questionCount: number;
};

export type ReusableGame = {
  id: string;
  moduleId: string;
  title: string;
  status: string;
  block: ContentBlock;
};

async function upload<T>(path: string, body: FormData) {
  const response = await fetch(path, { method: "POST", body });
  const payload = (await response.json().catch(() => null)) as (T & { ok?: boolean; message?: string }) | null;
  if (!response.ok || !payload?.ok) {
    return { ok: false as const, message: payload?.message || "That file could not be imported.", status: response.status };
  }
  return { ok: true as const, data: payload };
}

function withSlides<T extends { item?: AdminLesson }>(payload: T) {
  const item = payload.item;
  if (!item) return payload;
  return { ...payload, item: { ...item, slides: parseSlides(item.slides) } };
}

export async function loadAuthoringProvider() {
  return api<AuthoringProvider>("/api/admin/authoring/provider");
}

export async function loadTemplates() {
  const result = await api<{ items: LessonTemplate[] }>("/api/admin/templates");
  if (!result.ok) return result;
  return { ok: true as const, data: result.data.items };
}

export async function importIntoLesson(lessonId: string, file: File | null, text: string, mode: "append" | "replace" = "append") {
  const body = new FormData();
  body.set("mode", mode);
  body.set("text", text);
  if (file) body.set("file", file);
  const result = await upload<{ item: AdminLesson; status: string }>(`/api/admin/lessons/${lessonId}/import`, body);
  if (!result.ok) return result;
  return { ok: true as const, data: withSlides(result.data) };
}

export async function importNewLesson(moduleId: string, file: File | null, text: string, title = "", chapterId = "") {
  const body = new FormData();
  body.set("text", text);
  body.set("title", title);
  if (chapterId) body.set("chapter_id", chapterId);
  if (file) body.set("file", file);
  const result = await upload<{ item: AdminLesson; status: string }>(`/api/admin/modules/${moduleId}/import`, body);
  if (!result.ok) return result;
  return { ok: true as const, data: withSlides(result.data) };
}

export async function assistLesson(lessonId: string, action: "summarize" | "flashcards" | "quiz" | "game" | "mock") {
  const result = await api<{ item: AdminLesson; provider: string; degraded: boolean; status: string; appended: number; questions: number }>(
    `/api/admin/lessons/${lessonId}/assist`,
    { method: "POST", body: JSON.stringify({ action }) },
  );
  if (!result.ok) return result;
  return { ok: true as const, data: { ...withSlides(result.data), provider: result.data.provider, degraded: result.data.degraded, questions: result.data.questions } };
}

export async function checkLessonQuality(lessonId: string, slides: Slide[]) {
  const result = await api<{ warnings: { code: string; message: string }[] }>(`/api/admin/lessons/${lessonId}/quality`, {
    method: "POST",
    body: JSON.stringify({ slides }),
  });
  if (!result.ok) return result;
  return { ok: true as const, data: result.data.warnings };
}

export async function createFromTemplate(moduleId: string, template: string, title = "", chapterId = "") {
  const result = await api<{ item: AdminLesson; status: string }>(`/api/admin/modules/${moduleId}/lessons/from-template`, {
    method: "POST",
    body: JSON.stringify({ template, title, chapter_id: chapterId || null }),
  });
  if (!result.ok) return result;
  return { ok: true as const, data: withSlides(result.data) };
}

export async function insertTemplate(lessonId: string, template: string) {
  const result = await api<{ item: AdminLesson; status: string }>(`/api/admin/lessons/${lessonId}/template`, {
    method: "POST",
    body: JSON.stringify({ template }),
  });
  if (!result.ok) return result;
  return { ok: true as const, data: withSlides(result.data) };
}

export async function copyLessonTo(lessonId: string, moduleId: string, chapterId = "") {
  const result = await api<{ item: AdminLesson; status: string }>(`/api/admin/lessons/${lessonId}/copy`, {
    method: "POST",
    body: JSON.stringify({ module_id: moduleId, chapter_id: chapterId || null }),
  });
  if (!result.ok) return result;
  return { ok: true as const, data: withSlides(result.data) };
}

export async function copyChapterTo(chapterId: string, moduleId: string) {
  return api<{ chapter: { id: string; title: string }; lessons: AdminLesson[]; status: string }>(`/api/admin/chapters/${chapterId}/copy`, {
    method: "POST",
    body: JSON.stringify({ module_id: moduleId }),
  });
}

export async function loadBank(moduleId: string) {
  const result = await api<{ items: BankQuestion[] }>(`/api/admin/modules/${moduleId}/questions`);
  if (!result.ok) return result;
  return { ok: true as const, data: result.data.items };
}

export async function importQuestionFile(moduleId: string, file: File) {
  const body = new FormData();
  body.set("file", file);
  const result = await upload<{ items: BankQuestion[]; status: string }>(`/api/admin/modules/${moduleId}/questions/import`, body);
  if (!result.ok) return result;
  return { ok: true as const, data: result.data.items };
}

export async function saveBankQuestion(
  id: string,
  body: {
    prompt?: string;
    kind?: string;
    modelAnswer?: string;
    explanation?: string;
    topic?: string;
    choices?: string[];
    correctIndex?: number | null;
    accepted?: string[];
  },
) {
  return api<{ item: BankQuestion; status: string }>(`/api/admin/questions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      prompt: body.prompt,
      kind: body.kind,
      model_answer: body.modelAnswer,
      explanation: body.explanation,
      topic: body.topic,
      choices: body.choices,
      correct_index: body.correctIndex,
      accepted: body.accepted,
    }),
  });
}

export async function loadTopics(moduleId: string) {
  const result = await api<{ items: { id: string; title: string }[] }>(`/api/admin/modules/${moduleId}/topics`);
  if (!result.ok) return result;
  return { ok: true as const, data: result.data.items };
}

export async function importPastPaper(moduleId: string, file: File) {
  const body = new FormData();
  body.set("file", file);
  const result = await upload<{ paper: PastPaper; items: BankQuestion[]; status: string }>(`/api/admin/modules/${moduleId}/past-papers`, body);
  if (!result.ok) return result;
  return { ok: true as const, data: result.data };
}

export async function loadPastPapers(moduleId: string) {
  const result = await api<{ items: PastPaper[] }>(`/api/admin/modules/${moduleId}/past-papers`);
  if (!result.ok) return result;
  return { ok: true as const, data: result.data.items };
}

export async function loadGames(moduleId: string) {
  const result = await api<{ items: ReusableGame[] }>(`/api/admin/modules/${moduleId}/games`);
  if (!result.ok) return result;
  return { ok: true as const, data: result.data.items };
}

export async function saveReusableGame(moduleId: string, title: string, block: ContentBlock) {
  return api<{ item: ReusableGame; status: string }>(`/api/admin/modules/${moduleId}/games`, {
    method: "POST",
    body: JSON.stringify({ title, block }),
  });
}

export async function reuseGame(lessonId: string, gameId: string) {
  const result = await api<{ item: AdminLesson; status: string }>(`/api/admin/lessons/${lessonId}/games/${gameId}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!result.ok) return result;
  return { ok: true as const, data: withSlides(result.data) };
}
