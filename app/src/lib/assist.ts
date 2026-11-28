import { api } from "@/lib/api";

export type AssistStatus = {
  firecrawl: boolean;
  elevenlabs: boolean;
  elevenlabsSpeechToText: boolean;
  ai: boolean;
  aiModel: string;
  tesseract: boolean;
};

export type ResearchJob = {
  id: string;
  programmeId: string;
  moduleId: string;
  contentType: string;
  mode: string;
  urls: string[];
  status: string;
  error: string;
  note: string;
  duplicate: boolean;
  pages: { url: string; title: string; characters: number; markdown?: string }[];
  proposal: {
    chapters?: { title: string; summary?: string }[];
    lessons?: { title: string; chapter?: string; body?: string }[];
    questions?: { prompt: string; kind?: string }[];
  } | null;
  proposalStatus: string;
  proposalMessage: string;
  published: boolean;
  lessons: { id: string; title?: string; status: string }[];
  questions: { id: string; status: string }[];
};

export type AudioMeta = {
  assetId: string;
  url: string;
  cached: boolean;
  truncated: boolean;
  characters: number;
  message?: string;
};

export function proxyMedia(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith("/api/")) return `/api/stream${url.slice(4)}`;
  return url;
}

export async function loadAssistStatus() {
  return api<AssistStatus>("/api/learn/assist/status");
}

export async function startResearch(body: {
  programme_id: string;
  module_id: string;
  urls: string[];
  content_type: string;
  mode: string;
  force?: boolean;
}) {
  return api<ResearchJob>("/api/admin/research/jobs", { method: "POST", body: JSON.stringify(body) });
}

export async function loadResearchJob(id: string) {
  return api<ResearchJob>(`/api/admin/research/jobs/${id}`);
}

export async function proposeResearch(id: string) {
  return api<ResearchJob>(`/api/admin/research/jobs/${id}/propose`, { method: "POST", body: "{}" });
}

export async function importResearch(id: string) {
  return api<{
    status: string;
    published: boolean;
    alreadyImported: boolean;
    lessons: { id: string; title?: string; status: string }[];
    questions: { id: string; status: string }[];
    proposalStatus?: string;
  }>(`/api/admin/research/jobs/${id}/import`, { method: "POST", body: "{}" });
}

export async function requestLessonAudio(lessonId: string) {
  return api<AudioMeta>(`/api/learn/lessons/${lessonId}/audio`, { method: "POST", body: "{}" });
}

export async function requestQuizAudio(body: {
  quiz_id: string;
  part: "instruction" | "prompt" | "option" | "explanation";
  question_version_id?: string;
  option_id?: string;
}) {
  return api<AudioMeta>("/api/learn/audio/quiz", { method: "POST", body: JSON.stringify(body) });
}
