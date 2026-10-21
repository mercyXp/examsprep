import { api } from "@/lib/api";
import type { AnnouncementRow } from "@/lib/cms";
import { parseSlides, type Slide } from "@/lib/content";

export type CourseSummary = {
  id: string;
  code: string;
  name: string;
  description: string;
  objectives: string[];
  coverColor: string | null;
  totalLessons: number;
  completedLessons: number;
  progressPercent: number;
  continueLessonId: string | null;
};

export type CourseLesson = {
  id: string;
  title: string;
  description: string;
  durationMinutes: number | null;
  difficulty: string | null;
  completed: boolean;
  currentSlideIndex: number;
};

export type CourseChapter = {
  id: string;
  title: string;
  description: string;
  lessons: CourseLesson[];
};

export type CourseOverview = CourseSummary & { chapters: CourseChapter[] };

export type LessonProgress = {
  currentSlideIndex: number;
  revealedUnits: number;
  checkResults: Record<string, { selectedId?: string; correct?: boolean }>;
  completedAt: string | null;
  completed: boolean;
};

export type StudentLesson = {
  id: string;
  title: string;
  description: string;
  objectives: string[];
  durationMinutes: number | null;
  difficulty: string | null;
  moduleId: string;
  moduleCode: string | null;
  moduleName: string | null;
  chapterId: string | null;
  chapterTitle: string | null;
  slides: Slide[];
  nextLessonId: string | null;
  previousLessonId: string | null;
  progress: LessonProgress;
};

export async function loadCourses() {
  const result = await api<{ items: CourseSummary[] }>("/api/learn/modules");
  if (!result.ok) return result;
  return { ok: true as const, data: result.data.items ?? [] };
}

export async function loadCourse(id: string) {
  const result = await api<{ item: CourseOverview }>(`/api/learn/modules/${id}`);
  if (!result.ok) return result;
  return { ok: true as const, data: result.data.item };
}

export async function loadStudentLesson(id: string, preview = false) {
  const result = await api<{ item: StudentLesson }>(`/api/learn/lessons/${id}${preview ? "?preview=true" : ""}`);
  if (!result.ok) return result;
  const item = result.data.item;
  return {
    ok: true as const,
    data: {
      ...item,
      slides: parseSlides(item.slides),
      progress: item.progress ?? {
        currentSlideIndex: 0,
        revealedUnits: 0,
        checkResults: {},
        completedAt: null,
        completed: false,
      },
    },
  };
}

export type ExamTypeOption = {
  id: string;
  slug: string;
  name: string;
  position: number;
};

export type StudentExamSitting = {
  code: string;
  examType: string;
  examTypeName: string;
  source: "module" | "program";
  examDate: string | null;
  examTime: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  official: boolean;
};

export type StudentExamModule = {
  moduleId: string;
  code: string;
  name: string;
  programmeId: string | null;
  programmeName: string | null;
  examType: string;
  examTypeName: string;
  source: "module" | "program" | "period" | "personal" | "estimated" | "unpublished";
  examDate: string | null;
  examTime: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  official: boolean;
  estimatedDate: string | null;
};

export type StudentExamReminder = {
  code: string;
  name: string;
  examDate: string;
  examTime: string | null;
  source: string;
  official?: boolean;
  examTypeName?: string;
  windowStart?: string | null;
  windowEnd?: string | null;
};

export type StudentExamSchedule = {
  period: {
    id: string;
    name: string;
    academicYear: string;
    semesterNumber: number;
    windowStart: string;
    windowEnd: string;
    isCurrent: boolean;
    isPublished: boolean;
  } | null;
  examTypes: ExamTypeOption[];
  modules: StudentExamModule[];
  sittings: StudentExamSitting[];
  dates: string[];
  nextDate: string | null;
  source: string;
  reminders: StudentExamReminder[];
  revisionStart?: string | null;
};

export async function loadStudentAnnouncements() {
  const result = await api<{ items: AnnouncementRow[] }>("/api/learn/announcements");
  if (!result.ok) return result;
  return { ok: true as const, data: result.data.items ?? [] };
}

export async function markAnnouncementRead(id: string) {
  return api<{ ok: boolean }>(`/api/learn/announcements/${id}/read`, { method: "POST" });
}

export async function loadExamSchedule() {
  const result = await api<StudentExamSchedule>("/api/learn/exam-schedule");
  if (!result.ok) return result;
  return { ok: true as const, data: result.data };
}

export async function saveLessonProgress(
  lessonId: string,
  body: { currentSlideIndex: number; revealedUnits: number; checkResults: LessonProgress["checkResults"]; completed: boolean },
) {
  return api<{ progress: LessonProgress }>(`/api/learn/lessons/${lessonId}/progress`, {
    method: "PUT",
    body: JSON.stringify({
      current_slide_index: body.currentSlideIndex,
      revealed_units: body.revealedUnits,
      check_results: body.checkResults,
      completed: body.completed,
    }),
  });
}
