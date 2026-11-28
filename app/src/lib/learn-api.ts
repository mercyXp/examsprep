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
  yearNumber?: number | null;
  semesterNumber?: number | null;
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

export type CourseQuiz = {
  id: string;
  title: string;
  kind: string;
};

export type CourseOverview = CourseSummary & { chapters: CourseChapter[]; quizzes?: CourseQuiz[] };

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
  plainText?: string;
};

export type CatalogueCourse = {
  id: string;
  code: string;
  name: string;
  yearNumber: number | null;
  semesterNumber: number | null;
  selected: boolean;
};

export type CourseCatalogue = {
  programme: string | null;
  yearOfStudy: number | null;
  semesterOfStudy: number | null;
  limit: number;
  activeCount: number;
  items: CatalogueCourse[];
};

export type HistoryCourse = {
  id: string;
  code: string;
  name: string;
  yearNumber: number | null;
  semesterNumber: number | null;
  totalLessons: number;
  completedLessons: number;
  progressPercent: number;
};

export async function loadCatalogue() {
  const result = await api<CourseCatalogue>("/api/learn/catalogue");
  if (!result.ok) return result;
  return { ok: true as const, data: result.data };
}

export async function addCourse(code: string) {
  return loadCatalogueResult("/api/learn/selections", { method: "POST", body: JSON.stringify({ code }) });
}

export async function removeCourse(code: string) {
  return loadCatalogueResult(`/api/learn/selections/${encodeURIComponent(code)}`, { method: "DELETE" });
}

async function loadCatalogueResult(path: string, init: RequestInit) {
  const result = await api<CourseCatalogue>(path, init);
  if (!result.ok) return result;
  return { ok: true as const, data: result.data };
}

export async function loadLearningHistory() {
  const result = await api<{ items: HistoryCourse[] }>("/api/learn/history");
  if (!result.ok) return result;
  return { ok: true as const, data: result.data.items ?? [] };
}

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

export type StudyProgramme = {
  id: string;
  name: string;
  slug: string;
  category: string;
  status: string;
  durationYears: number | null;
  blurb: string;
  selectable: boolean;
  selected: boolean;
};

export async function loadProgrammes() {
  const result = await api<{ items: StudyProgramme[] }>("/api/learn/programmes");
  if (!result.ok) return result;
  return { ok: true as const, data: result.data.items ?? [] };
}

export async function selectProgramme(name: string) {
  return api<{ item: StudyProgramme }>("/api/learn/programme", {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

export type QuizQuestion = {
  id: string;
  prompt: string;
  points: number;
  kind: "mcq" | "true_false" | "short" | "blank" | "structured" | string;
  choices: { id: string; label: string }[];
};

export type QuizSummary = {
  id: string;
  title: string;
  kind: string;
  moduleId: string;
  moduleCode: string | null;
  moduleName: string | null;
  timeLimitSeconds: number | null;
  passMarkPercent: number | null;
  questionCount: number;
  attemptCount: number;
  bestScorePercent: number | null;
  latestScorePercent: number | null;
};

export type QuizDetail = {
  id: string;
  title: string;
  kind: string;
  moduleId: string;
  moduleCode: string | null;
  timeLimitSeconds: number | null;
  passMarkPercent: number | null;
  questions: QuizQuestion[];
  openAttempt: { id: string; startedAt: string; deadline: string | null } | null;
};

export type QuizAnswer = {
  question_version_id: string;
  selected_option_ids: string[];
  response_text: string;
};

export type GradedQuestion = {
  id: string;
  prompt: string;
  kind: string;
  correct: boolean;
  pointsAwarded: number;
  points: number;
  explanation: string;
  correctOptionIds: string[];
  modelAnswer: string;
  selectedOptionIds: string[];
  responseText: string;
  keyPointsMatched: number;
  keyPointsPossible: number;
  choices: { id: string; label: string }[];
};

export type QuizResult = {
  attemptId: string;
  scorePercent: number;
  passed: boolean;
  timedOut: boolean;
  pointsEarned: number;
  pointsPossible: number;
  questions: GradedQuestion[];
};

export type AttemptSummary = {
  id: string;
  quizId: string;
  title?: string;
  kind?: string;
  moduleCode?: string | null;
  startedAt: string;
  submittedAt: string | null;
  scorePercent: number | null;
  passed: boolean | null;
  timedOut: boolean;
};

export type TopicScore = {
  topicId: string | null;
  title: string;
  moduleCode: string;
  answered: number;
  correct: number;
  percent: number;
};

export type PerformanceSummary = {
  questionsAnswered: number;
  questionsCorrect: number;
  attemptCount: number;
  averageScorePercent: number | null;
  topics: TopicScore[];
  recentAttempts: AttemptSummary[];
};

export async function loadQuizzes() {
  const result = await api<{ items: QuizSummary[] }>("/api/learn/quizzes");
  if (!result.ok) return result;
  return { ok: true as const, data: result.data.items ?? [] };
}

export async function loadQuiz(id: string) {
  const result = await api<{ item: QuizDetail }>(`/api/learn/quizzes/${id}`);
  if (!result.ok) return result;
  return { ok: true as const, data: result.data.item };
}

export async function startQuiz(id: string) {
  const result = await api<{ attemptId: string; startedAt: string; deadline: string | null; questions: QuizQuestion[] }>(
    `/api/learn/quizzes/${id}/attempts/start`,
    { method: "POST", body: JSON.stringify({}) },
  );
  if (!result.ok) return result;
  return { ok: true as const, data: result.data };
}

export async function submitStartedQuiz(quizId: string, attemptId: string, answers: QuizAnswer[]) {
  const result = await api<QuizResult>(`/api/learn/quizzes/${quizId}/attempts/${attemptId}/submit`, {
    method: "POST",
    body: JSON.stringify({ answers }),
  });
  if (!result.ok) return result;
  return { ok: true as const, data: result.data };
}

export async function loadAttempt(id: string) {
  const result = await api<{ item: QuizResult & AttemptSummary & { title: string; questions: GradedQuestion[]; submitted: boolean } }>(
    `/api/learn/attempts/${id}`,
  );
  if (!result.ok) return result;
  return { ok: true as const, data: result.data.item };
}

export async function loadPerformance() {
  const result = await api<PerformanceSummary>("/api/learn/performance");
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
