import { computingModules, type ComputingModule } from "@/data/programmes";

export const EXAM_DATE_ISO = "2026-11-23";
export const SEMESTER_MODULES: ComputingModule[] = computingModules["2-1"] ?? [];

export const GOAL_OPTIONS = [
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 180, label: "3 hours" },
] as const;

export const PACE_OPTIONS = [
  { id: "relaxed", title: "Relaxed", hint: "Steady, lighter days." },
  { id: "balanced", title: "Balanced", hint: "A mix of lessons and quizzes." },
  { id: "intensive", title: "Intensive", hint: "More practice before the exam." },
] as const;

export const STUDY_DAYS = [
  { id: "mon", label: "Mon" },
  { id: "tue", label: "Tue" },
  { id: "wed", label: "Wed" },
  { id: "thu", label: "Thu" },
  { id: "fri", label: "Fri" },
  { id: "sat", label: "Sat" },
  { id: "sun", label: "Sun" },
] as const;

export function formatGoal(minutes: number) {
  const match = GOAL_OPTIONS.find((item) => item.minutes === minutes);
  if (match) return match.label;
  if (minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

export function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function toExamDateISO(value?: string | null) {
  const match = typeof value === "string" ? /^(\d{4}-\d{2}-\d{2})/.exec(value) : null;
  return match?.[1] ?? todayISO();
}

export function normalizeExamDates(values?: string[] | null, fallback?: string | null) {
  const dates = (values ?? [])
    .map((item) => (/^(\d{4}-\d{2}-\d{2})/.exec(item)?.[1] ?? ""))
    .filter((item, index, all) => item && all.indexOf(item) === index)
    .sort();
  if (dates.length) return dates;
  const single = typeof fallback === "string" ? /^(\d{4}-\d{2}-\d{2})/.exec(fallback)?.[1] : "";
  return single ? [single] : [];
}

export function nextExamDate(dates: string[]) {
  const today = todayISO();
  const upcoming = dates.filter((item) => item >= today);
  return upcoming[0] ?? dates[0] ?? today;
}

export function formatExamDate(iso = EXAM_DATE_ISO) {
  const date = new Date(`${toExamDateISO(iso)}T00:00:00`);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function examDateParts(iso = EXAM_DATE_ISO) {
  const date = new Date(`${toExamDateISO(iso)}T00:00:00`);
  return {
    day: date.toLocaleDateString("en-GB", { day: "numeric" }),
    month: date.toLocaleDateString("en-GB", { month: "short" }),
    year: date.toLocaleDateString("en-GB", { year: "numeric" }),
  };
}

export function recommendedModule(codes: string[]) {
  const selected = codes.length ? SEMESTER_MODULES.filter((mod) => codes.includes(mod.code)) : SEMESTER_MODULES;
  return selected.find((mod) => mod.code === "IT214") ?? selected[0] ?? SEMESTER_MODULES[0];
}

export function daysUntil(iso = EXAM_DATE_ISO) {
  const exam = new Date(`${toExamDateISO(iso)}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((exam.getTime() - now.getTime()) / 86400000));
}

export function formatExamTime(value?: string | null) {
  if (!value) return "";
  const [hourText, minuteText = "00"] = value.split(":");
  const hour = Number(hourText);
  if (!Number.isFinite(hour)) return value;
  const suffix = hour >= 12 ? "pm" : "am";
  const display = hour % 12 || 12;
  return `${display}:${minuteText.padStart(2, "0")} ${suffix}`;
}

export function formatExamWindow(start?: string | null, end?: string | null) {
  if (!start) return "Not scheduled";
  if (!end || end === start) return formatExamDate(start);
  return `${formatExamDate(start)} – ${formatExamDate(end)}`;
}

export function remainingLabel(iso?: string | null) {
  if (!iso) return "No exam date yet";
  const days = daysUntil(iso);
  if (days === 0) return "Exam day";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

export type ExamSittingLabel = {
  official?: boolean;
  source?: string;
  examDate?: string | null;
  examTime?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  examTypeName?: string | null;
};

export function examSittingCaption(item: ExamSittingLabel) {
  const type = item.examTypeName?.trim();
  const typeBit = type ? `${type} · ` : "";
  if (item.official && item.source === "module" && item.examDate) {
    return `Official · ${typeBit}${formatExamDate(item.examDate)}${item.examTime ? ` · ${formatExamTime(item.examTime)}` : ""}`;
  }
  if (item.official && (item.source === "program" || item.source === "period")) {
    return `Official window · ${typeBit}${formatExamWindow(item.windowStart, item.windowEnd)}`;
  }
  if ((item.source === "estimated" || item.source === "personal") && item.examDate) {
    return `Estimated · ${typeBit}${formatExamDate(item.examDate)}`;
  }
  return type ? `${type} · Not published yet` : "Not published yet";
}
