"use client";

import { useState } from "react";
import { saveOnboarding, type SessionUser } from "@/lib/auth";
import type { StudentExamSchedule } from "@/lib/learn-api";
import { examSittingCaption, formatExamDate, remainingLabel, SEMESTER_MODULES } from "@/lib/study";

export default function ExamTimetable({
  user,
  onUser,
  schedule,
}: {
  user: SessionUser;
  onUser: (user: SessionUser) => void;
  schedule: StudentExamSchedule | null;
}) {
  const [saving, setSaving] = useState(false);
  const official = schedule?.modules ?? [];
  const fallback = (user.moduleCodes.length ? SEMESTER_MODULES.filter((mod) => user.moduleCodes.includes(mod.code)) : SEMESTER_MODULES).map(
    (mod) => {
      const plan = user.moduleExamPlans[mod.code];
      return {
        code: mod.code,
        name: mod.name,
        examType: plan?.examType || "regular",
        examTypeName: plan?.examType || "Regular examinations",
        source: plan?.estimatedDate ? ("estimated" as const) : ("unpublished" as const),
        examDate: plan?.estimatedDate ?? user.examTimetable[mod.code] ?? null,
        examTime: null,
        windowStart: plan?.estimatedDate ?? user.examTimetable[mod.code] ?? null,
        windowEnd: plan?.estimatedDate ?? user.examTimetable[mod.code] ?? null,
        official: false,
        estimatedDate: plan?.estimatedDate ?? null,
      };
    },
  );
  const modules = official.length ? official : fallback;
  const nextDate = schedule?.nextDate || modules.find((item) => item.examDate)?.examDate || null;

  async function saveEstimate(code: string, iso: string) {
    const current = user.moduleExamPlans[code] || { examType: "regular", dateMode: "estimated", estimatedDate: null };
    const plans = {
      ...user.moduleExamPlans,
      [code]: {
        examType: current.examType || "regular",
        dateMode: iso ? "estimated" : "none",
        estimatedDate: iso || null,
      },
    };
    onUser({ ...user, moduleExamPlans: plans, examTimetable: { ...user.examTimetable, [code]: iso } });
    setSaving(true);
    const saved = await saveOnboarding({ module_exam_plans: plans });
    setSaving(false);
    if (saved) onUser(saved);
  }

  return (
    <>
      <article className="dash-card">
        <header className="dash-card-head">
          <h2>Remaining preparation time</h2>
          <span>{remainingLabel(nextDate)}</span>
        </header>
        <p>Study plans follow official sittings when they are published. Estimated dates never replace university dates.</p>
        <ul className="dash-time-mods">
          {modules.map((mod, index) => (
            <li key={mod.code}>
              <p>
                <span className={`dash-mod is-mod-${index % 5}`} aria-hidden="true" />
                <strong>
                  {mod.code} — {mod.name}
                </strong>
              </p>
              <small>
                {examSittingCaption(mod)} · {remainingLabel(mod.examDate || (mod.official ? mod.windowStart : null))}
              </small>
            </li>
          ))}
        </ul>
      </article>

      <article className="dash-card dash-time">
        <header className="dash-card-head">
          <h2>Exam timetable</h2>
          <span>
            {modules.filter((mod) => mod.official || mod.examDate).length}/{modules.length} modules dated
          </span>
        </header>
        <p className="dash-time-lede">Official university dates cannot be changed here.</p>
        <ul className="dash-time-mods">
          {modules.map((mod, index) => (
            <li key={mod.code}>
              <p>
                <span className={`dash-mod is-mod-${index % 5}`} aria-hidden="true" />
                <strong>
                  {mod.code} — {mod.name}
                </strong>
              </p>
              {mod.official ? (
                <small>{examSittingCaption(mod)}</small>
              ) : (
                <label className="dash-estimate">
                  <span>Estimated date</span>
                  <input type="date" value={mod.examDate || ""} onChange={(event) => saveEstimate(mod.code, event.target.value)} />
                  {mod.examDate ? <small>Estimated · {formatExamDate(mod.examDate)}</small> : <small>No date yet</small>}
                </label>
              )}
            </li>
          ))}
        </ul>
        {saving ? <p className="dash-empty">Saving timetable…</p> : null}
      </article>
    </>
  );
}
