import { EXAM_DATE_ISO, normalizeExamDates } from "@/lib/study";

export type SignInResult =
  | { ok: true; onboardingCompleted: boolean; roles: string[] }
  | { ok: false; message: string };

const STAFF_ROLES = new Set(["creator", "administrator", "super_administrator"]);

export function isStaffRole(roles: string[]) {
  return roles.some((role) => STAFF_ROLES.has(role));
}

async function readResult(response: Response): Promise<SignInResult> {
  const data: unknown = await response.json().catch(() => null);
  const payload = data && typeof data === "object" ? (data as { ok?: unknown; message?: unknown; onboardingCompleted?: unknown; roles?: unknown }) : null;

  if (response.ok && payload?.ok === true) {
    return {
      ok: true,
      onboardingCompleted: payload.onboardingCompleted === true,
      roles: Array.isArray(payload.roles) ? payload.roles.filter((item): item is string => typeof item === "string") : [],
    };
  }

  const message =
    typeof payload?.message === "string" && payload.message
      ? payload.message
      : "Something went wrong. Please try again.";

  return { ok: false, message };
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  return readResult(response);
}

export async function signInWithGoogle(): Promise<SignInResult> {
  const response = await fetch("/api/auth/google", { method: "POST" });
  return readResult(response);
}

export async function createAccount(
  name: string,
  email: string,
  password: string,
): Promise<SignInResult> {
  const response = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });

  return readResult(response);
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  onboardingCompleted: boolean;
  onboardingStep: number;
  university: string;
  programme: string;
  yearOfStudy: number | null;
  semesterOfStudy: number | null;
  examDate: string;
  examDates: string[];
  examTimetable: Record<string, string>;
  dailyGoalMinutes: number;
  pace: string;
  studyDays: string[];
  moduleCodes: string[];
  moduleExamPlans: Record<string, { examType: string; dateMode: string; estimatedDate: string | null }>;
  revisionStart: string | null;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asStringMap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string"),
  );
}

export function parseSessionUser(user: Record<string, unknown>): SessionUser | null {
  const id = asString(user.id);
  const email = asString(user.email);
  if (!id || !email) return null;

  const year = user.year_of_study;
  const semester = user.semester_of_study;
  return {
    id,
    name: asString(user.name),
    email,
    roles: asStringList(user.roles),
    onboardingCompleted: user.onboarding_completed === true,
    onboardingStep: typeof user.onboarding_step === "number" ? user.onboarding_step : 1,
    university: asString(user.university),
    programme: asString(user.programme),
    yearOfStudy: typeof year === "number" ? year : null,
    semesterOfStudy: typeof semester === "number" ? semester : null,
    examDate: asString(user.exam_date) || EXAM_DATE_ISO,
    examDates: normalizeExamDates(asStringList(user.exam_dates), asString(user.exam_date) || EXAM_DATE_ISO),
    examTimetable: asStringMap(user.exam_timetable),
    dailyGoalMinutes: typeof user.daily_goal_minutes === "number" ? user.daily_goal_minutes : 60,
    pace: asString(user.pace) || "balanced",
    studyDays: asStringList(user.study_days),
    moduleCodes: asStringList(user.module_codes),
    moduleExamPlans: asExamPlans(user.module_exam_plans),
    revisionStart: asString(user.revision_start) || null,
  };
}

function asExamPlans(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const plans: SessionUser["moduleExamPlans"] = {};
  for (const [code, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    plans[code] = {
      examType: asString(item.examType) || "regular",
      dateMode: asString(item.dateMode) || "official",
      estimatedDate: asString(item.estimatedDate) || null,
    };
  }
  return plans;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const response = await fetch("/api/auth/me", { cache: "no-store" });
  const data: unknown = await response.json().catch(() => null);
  const payload = data && typeof data === "object" ? (data as { ok?: unknown; user?: unknown }) : null;
  const user = payload?.user && typeof payload.user === "object" ? (payload.user as Record<string, unknown>) : null;

  if (!response.ok || payload?.ok !== true || !user) return null;
  return parseSessionUser(user);
}

export async function updateProfile(name: string): Promise<{ ok: true; user: SessionUser } | { ok: false; message: string }> {
  const response = await fetch("/api/auth/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data: unknown = await response.json().catch(() => null);
  const payload = data && typeof data === "object" ? (data as { ok?: unknown; user?: unknown; message?: unknown }) : null;
  const user = payload?.user && typeof payload.user === "object" ? parseSessionUser(payload.user as Record<string, unknown>) : null;
  if (!response.ok || payload?.ok !== true || !user) {
    return {
      ok: false,
      message: typeof payload?.message === "string" && payload.message ? payload.message : "We couldn’t update your profile.",
    };
  }
  return { ok: true, user };
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<SignInResult> {
  const response = await fetch("/api/auth/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  return readResult(response);
}

export type OnboardingPatch = {
  name?: string;
  university?: string;
  programme?: string;
  year_of_study?: number | null;
  semester_of_study?: number | null;
  exam_date?: string;
  exam_dates?: string[];
  exam_timetable?: Record<string, string>;
  daily_goal_minutes?: number;
  pace?: string;
  study_days?: string[];
  module_codes?: string[];
  module_exam_plans?: Record<string, { examType: string; dateMode: string; estimatedDate: string | null }>;
  revision_start?: string | null;
  onboarding_step?: number;
  complete?: boolean;
};

export async function saveOnboarding(body: OnboardingPatch): Promise<SessionUser | null> {
  const response = await fetch("/api/onboarding", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await response.json().catch(() => null);
  const payload = data && typeof data === "object" ? (data as { ok?: unknown; user?: unknown }) : null;
  const user = payload?.user && typeof payload.user === "object" ? (payload.user as Record<string, unknown>) : null;
  if (!response.ok || payload?.ok !== true || !user) return null;
  return parseSessionUser(user);
}

export function afterAuthPath(onboardingCompleted: boolean, roles: string[] = []) {
  if (isStaffRole(roles)) return "/admin";
  return onboardingCompleted ? "/dashboard" : "/onboarding";
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function requestPasswordReset(email: string): Promise<SignInResult> {
  const response = await fetch("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return readResult(response);
}
