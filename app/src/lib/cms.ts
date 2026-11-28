import { api } from "@/lib/api";
import { parseSlides, type Slide } from "@/lib/content";

export type AdminStats = {
  totalStudents: number;
  activeStudents: number;
  totalModules: number;
  publishedLessons: number;
  totalQuizzes: number;
};

export type AdminModule = {
  id: string;
  code: string;
  name: string;
  description: string;
  objectives: string[];
  coverColor: string | null;
  status: string;
  chapterCount: number;
  lessonCount: number;
  publishedLessons: number;
  createdAt: string | null;
  yearNumber: number | null;
  semesterNumber: number | null;
  programmeId: string | null;
  programmeName: string | null;
  updatedAt: string | null;
};

export type AdminChapter = {
  id: string;
  moduleId: string;
  title: string;
  description: string;
  position: number;
  status: string;
  lessonCount: number;
};

export type AdminLesson = {
  id: string;
  moduleId: string;
  chapterId: string | null;
  title: string;
  description: string;
  objectives: string[];
  durationMinutes: number | null;
  difficulty: string | null;
  position: number;
  status: string;
  moduleCode: string | null;
  moduleName: string | null;
  chapterTitle: string | null;
  slideCount: number;
  slides?: Slide[];
};

export type AdminScope = {
  role: string;
  roles: string[];
  canPublish: boolean;
  canManageCatalogue: boolean;
  canAssignAdmins: boolean;
  canAssignCreators: boolean;
  canManageStudents: boolean;
  canViewAcademic?: boolean;
  canManageAcademic?: boolean;
  canAnnounce?: boolean;
  canManageProgrammes?: boolean;
  canViewRewards?: boolean;
  programmes: { id: string; name: string; slug: string }[];
  modules: { id: string; code: string; name: string; programmeId: string | null; programmeName: string | null }[];
};

export type ProgramAdminRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  programmeId: string;
  programmeName: string;
};

export type CreatorAssignmentRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  programmeId: string | null;
  programmeName: string;
  moduleId: string | null;
  moduleCode: string;
  moduleName: string;
};

export type AdminStudent = {
  id: string;
  name: string;
  email: string;
  status: string;
  programme: string | null;
  yearOfStudy: number | null;
  semesterOfStudy: number | null;
  moduleCodes: string[];
  onboardingCompleted: boolean;
  lessonsStarted: number;
  lessonsCompleted: number;
  createdAt?: string | null;
  lastLoginAt?: string | null;
};

export type StudentSummary = {
  total: number;
  active: number;
  withProgress: number;
  completedLessons: number;
};

function asItems<T>(data: unknown, key = "items"): T[] {
  if (!data || typeof data !== "object") return [];
  const value = (data as Record<string, unknown>)[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function loadScope() {
  return api<AdminScope>("/api/admin/scope");
}

export async function loadOverview() {
  const result = await api<{ stats: AdminStats; recentLessons: AdminLesson[]; recentActivity: AdminLesson[] }>(
    "/api/admin/overview",
  );
  if (!result.ok) return result;
  return { ok: true as const, data: result.data };
}

export async function loadModules(q = "") {
  const result = await api<{ items: AdminModule[] }>(`/api/admin/modules${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  if (!result.ok) return result;
  return { ok: true as const, data: asItems<AdminModule>(result.data) };
}

export async function saveModule(
  body: Partial<AdminModule> & { code: string; name: string; programmeId?: string | null },
  id?: string,
) {
  return api<{ item: AdminModule }>(id ? `/api/admin/modules/${id}` : "/api/admin/modules", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify({
      code: body.code,
      name: body.name,
      description: body.description ?? "",
      objectives: body.objectives ?? [],
      cover_color: body.coverColor,
      status: body.status ?? "PUBLISHED",
      programme_id: body.programmeId || undefined,
    }),
  });
}

export async function loadChapters(moduleId: string) {
  const result = await api<{ items: AdminChapter[] }>(`/api/admin/chapters?module_id=${moduleId}`);
  if (!result.ok) return result;
  return { ok: true as const, data: asItems<AdminChapter>(result.data) };
}

export async function saveChapter(body: { moduleId: string; title: string; description?: string; status?: string }, id?: string) {
  return api<{ item: AdminChapter }>(id ? `/api/admin/chapters/${id}` : "/api/admin/chapters", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify({
      module_id: body.moduleId,
      title: body.title,
      description: body.description ?? "",
      status: body.status ?? "DRAFT",
    }),
  });
}

export async function deleteChapter(id: string) {
  return api(`/api/admin/chapters/${id}`, { method: "DELETE" });
}

export async function reorderChapters(moduleId: string, ids: string[]) {
  return api(`/api/admin/modules/${moduleId}/reorder-chapters`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export async function loadLessons(moduleId?: string, chapterId?: string, q = "") {
  const params = new URLSearchParams();
  if (moduleId) params.set("module_id", moduleId);
  if (chapterId) params.set("chapter_id", chapterId);
  if (q) params.set("q", q);
  const result = await api<{ items: AdminLesson[] }>(`/api/admin/lessons?${params.toString()}`);
  if (!result.ok) return result;
  return { ok: true as const, data: asItems<AdminLesson>(result.data) };
}

export async function createLesson(body: {
  title: string;
  description: string;
  objectives: string[];
  durationMinutes: number | null;
  difficulty: string | null;
  moduleId: string;
  chapterId: string | null;
}) {
  return api<{ item: AdminLesson }>("/api/admin/lessons", {
    method: "POST",
    body: JSON.stringify({
      title: body.title,
      description: body.description,
      objectives: body.objectives,
      duration_minutes: body.durationMinutes,
      difficulty: body.difficulty,
      module_id: body.moduleId,
      chapter_id: body.chapterId,
    }),
  });
}

export async function loadLesson(id: string) {
  const result = await api<{ item: AdminLesson }>(`/api/admin/lessons/${id}`);
  if (!result.ok) return result;
  const item = result.data.item;
  return { ok: true as const, data: { ...item, slides: parseSlides(item.slides) } };
}

export async function saveLessonMeta(id: string, body: {
  title: string;
  description: string;
  objectives: string[];
  durationMinutes: number | null;
  difficulty: string | null;
  moduleId: string;
  chapterId: string | null;
}) {
  return api<{ item: AdminLesson }>(`/api/admin/lessons/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: body.title,
      description: body.description,
      objectives: body.objectives,
      duration_minutes: body.durationMinutes,
      difficulty: body.difficulty,
      module_id: body.moduleId,
      chapter_id: body.chapterId,
    }),
  });
}

export async function saveLessonContent(id: string, slides: Slide[]) {
  return api<{ item: AdminLesson }>(`/api/admin/lessons/${id}/content`, {
    method: "PUT",
    body: JSON.stringify({ slides }),
  });
}

export type UploadedMedia = {
  url: string;
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
  kind: string;
};

export async function uploadLessonMedia(lessonId: string, file: File, kind: "image" | "video" | "audio" | "file") {
  const body = new FormData();
  body.append("file", file);
  const result = await fetch(`/api/admin/lessons/${lessonId}/media?kind=${encodeURIComponent(kind)}`, {
    method: "POST",
    body,
  });
  const payload = (await result.json().catch(() => null)) as { ok?: boolean; message?: string; item?: UploadedMedia } | null;
  if (!result.ok || !payload?.ok || !payload.item) {
    return {
      ok: false as const,
      message: payload?.message || "That file could not be uploaded.",
      status: result.status,
    };
  }
  return { ok: true as const, data: payload.item };
}

export async function publishLesson(id: string, action: "publish" | "unpublish" | "archive" | "duplicate" | "submit") {
  return api<{ item: AdminLesson }>(`/api/admin/lessons/${id}/${action}`, { method: "POST" });
}

export async function reviewLesson(id: string, decision: "approve" | "reject", reason = "") {
  return api<{ item: AdminLesson }>(`/api/admin/lessons/${id}/review`, {
    method: "POST",
    body: JSON.stringify({ decision, reason }),
  });
}

export async function deleteLesson(id: string) {
  return api(`/api/admin/lessons/${id}`, { method: "DELETE" });
}

export async function reorderLessons(moduleId: string, ids: string[]) {
  return api(`/api/admin/modules/${moduleId}/reorder-lessons`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export async function loadStudents(
  q = "",
  page = 1,
  filters: { status?: string; programme?: string; pageSize?: number } = {},
) {
  const params = new URLSearchParams({
    q,
    page: String(page),
    page_size: String(filters.pageSize ?? 10),
  });
  if (filters.status) params.set("status", filters.status);
  if (filters.programme) params.set("programme", filters.programme);
  return api<{ items: AdminStudent[]; total: number; page: number; pageSize: number; summary?: StudentSummary }>(
    `/api/admin/students?${params}`,
  );
}

export async function loadStudent(id: string) {
  return api<{ student: AdminStudent; progress: Array<{ lessonId: string; title: string | null; moduleCode: string | null; completedAt: string | null }> }>(
    `/api/admin/students/${id}`,
  );
}

export async function setStudentStatus(id: string, status: string) {
  return api(`/api/admin/students/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export async function loadAssignments() {
  return api<{
    programAdmins: ProgramAdminRow[];
    creators: CreatorAssignmentRow[];
    people: Array<{ id: string; name: string; email: string; roles: string[] }>;
  }>("/api/admin/assignments");
}

export async function assignProgramAdmin(userId: string, programmeId: string) {
  return api("/api/admin/assignments/program-admins", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, programme_id: programmeId }),
  });
}

export async function revokeProgramAdmin(id: string) {
  return api(`/api/admin/assignments/program-admins/${id}`, { method: "DELETE" });
}

export async function assignCreator(userId: string, programmeId: string, moduleId: string) {
  return api("/api/admin/assignments/creators", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, programme_id: programmeId, module_id: moduleId }),
  });
}

export async function revokeCreator(id: string) {
  return api(`/api/admin/assignments/creators/${id}`, { method: "DELETE" });
}

export type AcademicPeriod = {
  id: string;
  name: string;
  academicYear: string;
  semesterNumber: number;
  windowStart: string;
  windowEnd: string;
  isCurrent: boolean;
  isPublished: boolean;
};

export type ScheduleWarning = {
  level: "error" | "warning";
  code: string;
  message: string;
};

export type ProgramExamRow = {
  id: string;
  name: string;
  slug: string;
  startDate: string | null;
  endDate: string | null;
  adminsCanEdit: boolean;
  scheduled: boolean;
  canEdit: boolean;
};

export type ModuleExamRow = {
  id: string;
  code: string;
  name: string;
  programmeId: string | null;
  programmeName: string | null;
  examDate: string | null;
  examTime: string | null;
  scheduled: boolean;
  canEdit: boolean;
};

export type ExamTypeOption = {
  id: string;
  slug: string;
  name: string;
  position: number;
};

export type AcademicSchedule = {
  period: AcademicPeriod;
  periods: AcademicPeriod[];
  examType: ExamTypeOption;
  examTypes: ExamTypeOption[];
  permissions: { canManagePeriod: boolean; canCreatePeriod: boolean };
  programmes: ProgramExamRow[];
  modules: ModuleExamRow[];
  warnings: ScheduleWarning[];
};

export async function loadAcademicSchedule(periodId?: string, examTypeId?: string) {
  const params = new URLSearchParams();
  if (periodId) params.set("period_id", periodId);
  if (examTypeId) params.set("exam_type_id", examTypeId);
  const query = params.toString() ? `?${params.toString()}` : "";
  return api<AcademicSchedule>(`/api/admin/academic-calendar${query}`);
}

export async function saveAcademicPeriod(
  body: {
    name: string;
    academicYear: string;
    semesterNumber: number;
    windowStart: string;
    windowEnd: string;
    isCurrent: boolean;
    isPublished: boolean;
  },
  periodId?: string,
) {
  const payload = {
    name: body.name,
    academic_year: body.academicYear,
    semester_number: body.semesterNumber,
    window_start: body.windowStart,
    window_end: body.windowEnd,
    is_current: body.isCurrent,
    is_published: body.isPublished,
  };
  if (periodId) {
    return api<AcademicSchedule>(`/api/admin/academic-periods/${periodId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }
  return api<AcademicSchedule>("/api/admin/academic-periods", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteAcademicPeriod(periodId: string) {
  return api<AcademicSchedule>(`/api/admin/academic-periods/${periodId}`, { method: "DELETE" });
}

export async function saveProgramExamSchedule(
  periodId: string,
  programmeId: string,
  body: { startDate: string; endDate: string; adminsCanEdit?: boolean; examTypeId?: string },
) {
  return api<AcademicSchedule>(`/api/admin/academic-periods/${periodId}/programmes/${programmeId}`, {
    method: "PUT",
    body: JSON.stringify({
      start_date: body.startDate,
      end_date: body.endDate,
      admins_can_edit: body.adminsCanEdit,
      exam_type_id: body.examTypeId,
    }),
  });
}

export async function deleteProgramExamSchedule(periodId: string, programmeId: string, examTypeId?: string) {
  const query = examTypeId ? `?exam_type_id=${encodeURIComponent(examTypeId)}` : "";
  return api<AcademicSchedule>(`/api/admin/academic-periods/${periodId}/programmes/${programmeId}${query}`, {
    method: "DELETE",
  });
}

export async function saveModuleExamSlot(
  periodId: string,
  moduleId: string,
  body: { examDate: string; examTime?: string | null; examTypeId?: string },
) {
  return api<AcademicSchedule>(`/api/admin/academic-periods/${periodId}/modules/${moduleId}`, {
    method: "PUT",
    body: JSON.stringify({
      exam_date: body.examDate,
      exam_time: body.examTime || null,
      exam_type_id: body.examTypeId,
    }),
  });
}

export async function deleteModuleExamSlot(periodId: string, moduleId: string, examTypeId?: string) {
  const query = examTypeId ? `?exam_type_id=${encodeURIComponent(examTypeId)}` : "";
  return api<AcademicSchedule>(`/api/admin/academic-periods/${periodId}/modules/${moduleId}${query}`, {
    method: "DELETE",
  });
}

export async function createExamType(name: string) {
  return api<{ item: ExamTypeOption; items: ExamTypeOption[] }>("/api/admin/exam-types", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export type AdminProgramme = {
  id: string;
  name: string;
  slug: string;
  category: string;
  status: string;
  durationYears: number | null;
  blurb: string;
  moduleCount: number;
};

export async function loadProgrammes() {
  const result = await api<{ items: AdminProgramme[]; canManage?: boolean }>("/api/admin/programmes");
  if (!result.ok) return result;
  return {
    ok: true as const,
    data: { items: result.data.items ?? [], canManage: Boolean(result.data.canManage) },
  };
}

export async function saveProgramme(
  body: { name: string; category: string; status: string; durationYears: number; blurb: string },
  id?: string,
) {
  return api<{ item: AdminProgramme }>(id ? `/api/admin/programmes/${id}` : "/api/admin/programmes", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify({
      name: body.name,
      category: body.category,
      status: body.status,
      duration_years: body.durationYears,
      blurb: body.blurb,
    }),
  });
}

export async function archiveProgramme(id: string) {
  return api<{ item: AdminProgramme }>(`/api/admin/programmes/${id}/archive`, { method: "POST" });
}

export type AnnouncementKind = "examination" | "academic" | "course" | "reminder" | "general";
export type AnnouncementAudience = "all" | "programmes" | "modules" | "group";
export type AnnouncementPriority = "normal" | "important" | "urgent";
export type AnnouncementStatus = "draft" | "scheduled" | "published" | "expired";

export type AnnouncementRow = {
  id: string;
  title: string;
  message: string;
  kind: AnnouncementKind;
  kindLabel: string;
  audienceKind: AnnouncementAudience;
  audienceLabel: string;
  programmeIds: string[];
  moduleIds: string[];
  programmeNames: string[];
  moduleNames: string[];
  yearOfStudy: number | null;
  semesterOfStudy: number | null;
  priority: AnnouncementPriority;
  priorityLabel: string;
  status: string;
  effectiveStatus: AnnouncementStatus;
  isPinned: boolean;
  publishAt: string | null;
  expiresAt: string | null;
  linkKind: string | null;
  linkId: string | null;
  link: { kind: string; href: string; label: string } | null;
  createdByName: string | null;
  createdAt: string | null;
  publishedByName: string | null;
  publishedAt: string | null;
  read?: boolean;
};

export type AnnouncementDraft = {
  title: string;
  message: string;
  kind: AnnouncementKind;
  audienceKind: AnnouncementAudience;
  programmeIds: string[];
  moduleIds: string[];
  yearOfStudy: number | null;
  semesterOfStudy: number | null;
  priority: AnnouncementPriority;
  isPinned: boolean;
  publishAt: string;
  expiresAt: string;
  linkKind: string;
  linkId: string;
  action: "draft" | "publish" | "schedule";
};

export const ANNOUNCEMENT_KINDS: { id: AnnouncementKind; label: string }[] = [
  { id: "examination", label: "Examination" },
  { id: "academic", label: "Academic notice" },
  { id: "course", label: "Course update" },
  { id: "reminder", label: "Study reminder" },
  { id: "general", label: "General" },
];

export const ANNOUNCEMENT_PRIORITIES: { id: AnnouncementPriority; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "important", label: "Important" },
  { id: "urgent", label: "Urgent" },
];

export async function loadAnnouncements(query = "", status = "", kind = "") {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (status) params.set("status", status);
  if (kind) params.set("kind", kind);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return api<{ items: AnnouncementRow[]; stats: { total: number; published: number; drafts: number; scheduled: number } }>(
    `/api/admin/announcements${suffix}`,
  );
}

export async function loadAnnouncement(id: string) {
  return api<{ item: AnnouncementRow }>(`/api/admin/announcements/${id}`);
}

export async function saveAnnouncement(body: AnnouncementDraft, id?: string) {
  const payload = {
    title: body.title,
    message: body.message,
    kind: body.kind,
    audience_kind: body.audienceKind,
    programme_ids: body.programmeIds,
    module_ids: body.moduleIds,
    year_of_study: body.yearOfStudy,
    semester_of_study: body.semesterOfStudy,
    priority: body.priority,
    is_pinned: body.isPinned,
    publish_at: body.publishAt || null,
    expires_at: body.expiresAt || null,
    link_kind: body.linkKind || null,
    link_id: body.linkId || null,
    action: body.action,
  };
  if (id) {
    return api<{ item: AnnouncementRow }>(`/api/admin/announcements/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }
  return api<{ item: AnnouncementRow }>("/api/admin/announcements", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteAnnouncement(id: string) {
  return api<{ ok: boolean }>(`/api/admin/announcements/${id}`, { method: "DELETE" });
}

export function moduleLabel(item: { code: string; name?: string | null; programmeName?: string | null }) {
  const title = item.name ? `${item.code} — ${item.name}` : item.code;
  return item.programmeName ? `${item.programmeName} · ${title}` : title;
}

export function courseLabel(item: { code: string; name?: string | null }) {
  return item.name ? `${item.code} — ${item.name}` : item.code;
}

const LESSON_RETURN =
  /^\/admin\/lessons\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/chapters\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/i;

/** Only the guided lessons steps are safe return targets for the studio back link. */
export function lessonReturnPath(value: string | null | undefined) {
  if (!value || !LESSON_RETURN.test(value)) return "/admin/lessons";
  return value;
}

export function lessonEditorHref(lessonId: string, from?: string | null) {
  const back = lessonReturnPath(from);
  const href = `/admin/lessons/${lessonId}/edit`;
  if (back === "/admin/lessons") return href;
  return `${href}?from=${encodeURIComponent(back)}`;
}

export function lessonStatusTone(status: string) {
  if (status === "PUBLISHED") return "published";
  if (status === "DRAFT") return "draft";
  if (status === "IN_REVIEW" || status === "CHANGES_REQUESTED") return "review";
  return "muted";
}

export function statusLabel(status: string) {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "IN_REVIEW":
      return "In review";
    case "CHANGES_REQUESTED":
      return "Changes requested";
    case "PUBLISHED":
      return "Published";
    case "UNPUBLISHED":
      return "Unpublished";
    case "ARCHIVED":
      return "Archived";
    default:
      return status;
  }
}
