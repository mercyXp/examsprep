"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import BrandLogo from "@/app/components/ui/BrandLogo";
import ThemeToggle from "@/app/components/ui/ThemeToggle";
import { computingModules, programmeByName, programmeBySlug, studyProgrammes } from "@/data/programmes";
import { getSessionUser, saveOnboarding, type SessionUser } from "@/lib/auth";
import { loadExamSchedule, type StudentExamSchedule } from "@/lib/learn-api";
import {
  GOAL_OPTIONS,
  PACE_OPTIONS,
  SEMESTER_MODULES,
  STUDY_DAYS,
  examSittingCaption,
  formatExamDate,
  formatExamWindow,
  formatGoal,
  recommendedModule,
} from "@/lib/study";

type ModulePlan = { examType: string; dateMode: string; estimatedDate: string | null };

const FALLBACK_EXAM_TYPES = [
  { slug: "regular", name: "Regular examinations" },
  { slug: "supplementary", name: "Supplementary examinations" },
  { slug: "deferred", name: "Deferred examinations" },
  { slug: "other", name: "Other / resit examination" },
];

function emptyPlan(examType = "regular", dateMode = "official"): ModulePlan {
  return { examType, dateMode, estimatedDate: null };
}

type Step = 1 | 2 | 3 | 4 | 5;

function WelcomeArt() {
  return (
    <div className="onb-art">
      <Image
        src="/img/examready.png"
        alt="A notebook on a desk that reads Are you ready for exams?"
        width={1600}
        height={1067}
        className="onb-art-img"
        priority
      />
    </div>
  );
}

export default function OnboardingExperience() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [university, setUniversity] = useState("");
  const [programmeSlug, setProgrammeSlug] = useState("");
  const [year, setYear] = useState<number | null>(null);
  const [semester, setSemester] = useState<number | null>(null);
  const [modules, setModules] = useState<string[]>([]);
  const [goal, setGoal] = useState(60);
  const [pace, setPace] = useState("balanced");
  const [days, setDays] = useState<string[]>(["mon", "tue", "wed", "thu", "fri"]);
  const [official, setOfficial] = useState<StudentExamSchedule | null>(null);
  const [plans, setPlans] = useState<Record<string, ModulePlan>>({});
  const [defaultType, setDefaultType] = useState("regular");
  const [dateMode, setDateMode] = useState<"official" | "estimated">("official");
  const [revisionStart, setRevisionStart] = useState("");

  useEffect(() => {
    let cancelled = false;
    getSessionUser().then((session) => {
      if (cancelled) return;
      if (!session) {
        router.replace("/signup");
        return;
      }
      if (session.onboardingCompleted) {
        router.replace("/dashboard");
        return;
      }
      setUser(session);
      setName(session.name);
      setUniversity(session.university);
      setProgrammeSlug(programmeByName(session.programme)?.slug ?? "");
      setYear(session.yearOfStudy);
      setSemester(session.semesterOfStudy);
      const published = computingModules[`${session.yearOfStudy}-${session.semesterOfStudy}`] ?? [];
      setModules(session.moduleCodes.length ? session.moduleCodes : published.map((item) => item.code));
      setGoal(session.dailyGoalMinutes || 60);
      setPace(session.pace || "balanced");
      setDays(session.studyDays.length ? session.studyDays : ["mon", "tue", "wed", "thu", "fri"]);
      const savedPlans = session.moduleExamPlans || {};
      setPlans(savedPlans);
      const firstPlan = Object.values(savedPlans)[0];
      if (firstPlan?.examType) setDefaultType(firstPlan.examType);
      if (firstPlan?.dateMode === "estimated") setDateMode("estimated");
      setRevisionStart(session.revisionStart || "");
      const resume = Math.min(5, Math.max(1, session.onboardingStep)) as Step;
      setStep(resume);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (step < 4) return;
    loadExamSchedule().then((result) => {
      if (result.ok) setOfficial(result.data);
    });
  }, [step]);

  const first = recommendedModule(modules);
  const goalLabel = formatGoal(goal);
  const chosenProgramme = programmeBySlug(programmeSlug);
  const programmeUnavailable = Boolean(chosenProgramme && !chosenProgramme.available);
  const programmeName = chosenProgramme?.available ? chosenProgramme.name : "";
  const publishedModules = useMemo(
    () => (year && semester ? computingModules[`${year}-${semester}`] ?? [] : []),
    [year, semester],
  );

  const toggleModule = (code: string) => {
    setModules((current) => (current.includes(code) ? current.filter((item) => item !== code) : [...current, code]));
  };

  const toggleDay = (id: string) => {
    setDays((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const examTypes = official?.examTypes?.length ? official.examTypes : FALLBACK_EXAM_TYPES;
  const sittings = official?.sittings ?? [];

  function planFor(code: string): ModulePlan {
    return plans[code] ?? emptyPlan(defaultType, dateMode);
  }

  function sittingFor(code: string, examType: string) {
    return sittings.find((item) => item.code === code && item.examType === examType) ?? null;
  }

  function applyType(slug: string) {
    setDefaultType(slug);
    setPlans((current) =>
      Object.fromEntries(modules.map((code) => [code, { ...(current[code] ?? emptyPlan(slug, dateMode)), examType: slug }])),
    );
  }

  function applyDateMode(mode: "official" | "estimated") {
    setDateMode(mode);
    setPlans((current) =>
      Object.fromEntries(
        modules.map((code) => [
          code,
          {
            ...(current[code] ?? emptyPlan(defaultType, mode)),
            dateMode: mode,
            estimatedDate: mode === "official" ? current[code]?.estimatedDate ?? null : current[code]?.estimatedDate ?? null,
          },
        ]),
      ),
    );
  }

  function patchPlan(code: string, patch: Partial<ModulePlan>) {
    setPlans((current) => ({
      ...current,
      [code]: { ...(current[code] ?? emptyPlan(defaultType, dateMode)), ...patch },
    }));
  }

  function plansPayload() {
    return Object.fromEntries(
      modules.map((code) => {
        const plan = planFor(code);
        const sitting = sittingFor(code, plan.examType);
        const mode = sitting ? "official" : plan.dateMode === "estimated" && plan.estimatedDate ? "estimated" : plan.dateMode;
        return [
          code,
          {
            examType: plan.examType,
            dateMode: mode === "official" && !sitting && plan.estimatedDate ? "estimated" : mode,
            estimatedDate: sitting ? null : plan.estimatedDate,
          },
        ];
      }),
    );
  }

  async function persist(nextStep: Step, extra: Parameters<typeof saveOnboarding>[0] = {}) {
    setBusy(true);
    try {
      const saved = await saveOnboarding({ onboarding_step: nextStep, ...extra });
      if (saved) setUser(saved);
      setStep(nextStep);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!programmeName || !year || !semester) return;
    setBusy(true);
    try {
      await saveOnboarding({
        name,
        university,
        programme: programmeName,
        year_of_study: year,
        semester_of_study: semester,
        daily_goal_minutes: goal,
        pace,
        study_days: days,
        module_codes: modules,
        module_exam_plans: plansPayload(),
        revision_start: revisionStart || null,
        onboarding_step: 5,
        complete: true,
      });
      router.replace("/dashboard");
    } finally {
      setBusy(false);
    }
  }

  const copy = useMemo(() => {
    if (step === 1) return { kicker: "Welcome", title: "Let’s get you exam-ready!" };
    if (step === 2) return { kicker: "Your profile", title: "Set up your profile" };
    if (step === 3) return { kicker: "This semester", title: "Choose your modules" };
    if (step === 4) return { kicker: "Your plan", title: "Create your study plan" };
    return { kicker: "All set", title: "You’re ready!" };
  }, [step]);

  if (!ready) {
    return (
      <div className="onb-boot" aria-busy="true">
        <p>Preparing your study setup…</p>
      </div>
    );
  }

  return (
    <div className="onb-shell">
      <header className="onb-top">
        <BrandLogo className="logo onb-brand" priority />
        <p className="onb-count">
          {step} of 5
        </p>
        <ThemeToggle />
      </header>

      <div className="onb-progress" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((item) => (
          <span key={item} className={item <= step ? "is-on" : undefined} />
        ))}
      </div>

      <div className={`onb-stage is-step-${step}`}>
        {step === 1 ? <WelcomeArt /> : null}

        <section className="onb-panel">
          <p className="onb-kicker">{copy.kicker}</p>
          <h1>{copy.title}</h1>

          {step === 1 ? (
            <>
              <p className="onb-lede">
                Learn smarter, practice questions, and track your progress — all in one place.
              </p>
              <button type="button" className="onb-cta" disabled={busy} onClick={() => persist(2)}>
                Let’s get started
              </button>
            </>
          ) : null}

          {step === 2 ? (
            <form
              className="onb-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (programmeUnavailable || !programmeName || !year || !semester) return;
                setModules((computingModules[`${year}-${semester}`] ?? []).map((item) => item.code));
                persist(3, {
                  name: name.trim() || user?.name,
                  university,
                  programme: programmeName,
                  year_of_study: year,
                  semester_of_study: semester,
                });
              }}
            >
              <p className="onb-lede">Programme, year, and semester are required. University is optional.</p>
              <label>
                Full name
                <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
              </label>
              <label>
                University or college <span>optional</span>
                <input
                  value={university}
                  onChange={(event) => setUniversity(event.target.value)}
                  placeholder="Cavendish University Zambia"
                />
              </label>
              <label>
                Programme
                <select
                  required
                  className={programmeUnavailable ? "is-error" : undefined}
                  value={programmeSlug}
                  aria-invalid={programmeUnavailable || undefined}
                  aria-describedby={programmeUnavailable ? "onb-programme-error" : undefined}
                  onChange={(event) => setProgrammeSlug(event.target.value)}
                >
                  <option value="">Select a programme</option>
                  {studyProgrammes.map((item) => (
                    <option key={item.slug} value={item.slug}>
                      {item.name}
                    </option>
                  ))}
                </select>
                {programmeUnavailable ? (
                  <p className="onb-error" id="onb-programme-error" role="alert">
                    NOT YET AVAILABLE
                  </p>
                ) : null}
              </label>
              <fieldset>
                <legend>Current year of study</legend>
                <div className="onb-chips">
                  {[1, 2, 3, 4].map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={year === item ? "is-on" : undefined}
                      aria-pressed={year === item}
                      onClick={() => {
                        if (year === item) return;
                        setYear(item);
                        setModules((computingModules[`${item}-${semester}`] ?? []).map((mod) => mod.code));
                      }}
                    >
                      Year {item}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Semester</legend>
                <div className="onb-chips">
                  {[1, 2].map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={semester === item ? "is-on" : undefined}
                      aria-pressed={semester === item}
                      onClick={() => {
                        if (semester === item) return;
                        setSemester(item);
                        setModules((computingModules[`${year}-${item}`] ?? []).map((mod) => mod.code));
                      }}
                    >
                      Semester {item}
                    </button>
                  ))}
                </div>
              </fieldset>
              <button
                type="submit"
                className="onb-cta"
                disabled={busy || !name.trim() || !programmeName || programmeUnavailable || !year || !semester}
              >
                Continue
              </button>
            </form>
          ) : null}

          {step === 3 ? (
            <>
              <p className="onb-lede">
                {publishedModules.length
                  ? `Pick the Year ${year} Semester ${semester} modules you’re preparing for.`
                  : `Modules for Year ${year} Semester ${semester} aren’t published yet. Computing currently has Year 2 Semester 1.`}
              </p>
              <ul className="onb-modules">
                {publishedModules.map((mod, index) => {
                  const on = modules.includes(mod.code);
                  return (
                    <li key={mod.code}>
                      <button type="button" className={`onb-mod is-mod-${index}${on ? " is-on" : ""}`} onClick={() => toggleModule(mod.code)}>
                        <span className="onb-check" aria-hidden="true">
                          {on ? "✓" : ""}
                        </span>
                        <strong>{mod.code}</strong>
                        <span>{mod.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                className="onb-cta"
                disabled={busy || modules.length === 0}
                onClick={() => persist(4, { module_codes: modules })}
              >
                Continue with {modules.length} module{modules.length === 1 ? "" : "s"}
              </button>
            </>
          ) : null}

          {step === 4 ? (
            <form
              className="onb-form"
              onSubmit={(event) => {
                event.preventDefault();
                persist(5, {
                  daily_goal_minutes: goal,
                  pace,
                  study_days: days,
                  module_codes: modules,
                  module_exam_plans: plansPayload(),
                  revision_start: revisionStart || null,
                });
              }}
            >
              <p className="onb-lede">Choose the examination you are preparing for. Official dates are used when published.</p>
              <fieldset>
                <legend>Which examination are you preparing for?</legend>
                <div className="onb-chips">
                  {examTypes.map((item) => (
                    <button
                      key={item.slug}
                      type="button"
                      className={defaultType === item.slug ? "is-on" : undefined}
                      aria-pressed={defaultType === item.slug}
                      onClick={() => applyType(item.slug)}
                    >
                      {item.name.replace(" examinations", "")}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>How will the examination date be determined?</legend>
                <div className="onb-paces">
                  <button type="button" className={dateMode === "official" ? "is-on" : undefined} onClick={() => applyDateMode("official")}>
                    <strong>Use the official date</strong>
                    <span>Published by the university for this exam type.</span>
                  </button>
                  <button type="button" className={dateMode === "estimated" ? "is-on" : undefined} onClick={() => applyDateMode("estimated")}>
                    <strong>Not published yet</strong>
                    <span>Enter an estimate or continue without a date.</span>
                  </button>
                </div>
              </fieldset>
              <ul className="onb-plans">
                {modules.map((code) => {
                  const mod = publishedModules.find((item) => item.code === code) ?? SEMESTER_MODULES.find((item) => item.code === code);
                  const plan = planFor(code);
                  const sitting = sittingFor(code, plan.examType);
                  return (
                    <li key={code} className="onb-plan">
                      <header>
                        <strong>{mod ? `${mod.code} — ${mod.name}` : code}</strong>
                        <small>{sitting ? examSittingCaption(sitting) : "No official date for this type"}</small>
                      </header>
                      <div className="onb-plan-row">
                        <label>
                          Exam type
                          <select value={plan.examType} onChange={(event) => patchPlan(code, { examType: event.target.value })}>
                            {examTypes.map((item) => (
                              <option key={item.slug} value={item.slug}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        {sitting ? (
                          <p>
                            Official date
                            <strong>{examSittingCaption(sitting)}</strong>
                          </p>
                        ) : (
                          <label>
                            Estimated date <span>optional</span>
                            <input
                              type="date"
                              value={plan.estimatedDate || ""}
                              onChange={(event) =>
                                patchPlan(code, {
                                  dateMode: event.target.value ? "estimated" : "none",
                                  estimatedDate: event.target.value || null,
                                })
                              }
                            />
                          </label>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <label>
                Personal revision start <span>optional</span>
                <input type="date" value={revisionStart} onChange={(event) => setRevisionStart(event.target.value)} />
              </label>
              <fieldset>
                <legend>Daily study goal</legend>
                <div className="onb-chips">
                  {GOAL_OPTIONS.map((item) => (
                    <button
                      key={item.minutes}
                      type="button"
                      className={goal === item.minutes ? "is-on" : undefined}
                      onClick={() => setGoal(item.minutes)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Preparation pace</legend>
                <div className="onb-paces">
                  {PACE_OPTIONS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={pace === item.id ? "is-on" : undefined}
                      onClick={() => setPace(item.id)}
                    >
                      <strong>{item.title}</strong>
                      <span>{item.hint}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Preferred study days</legend>
                <div className="onb-chips">
                  {STUDY_DAYS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={days.includes(item.id) ? "is-on" : undefined}
                      onClick={() => toggleDay(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <button type="submit" className="onb-cta" disabled={busy}>
                Build my study plan
              </button>
              <button
                type="button"
                className="onb-skip"
                disabled={busy}
                onClick={() =>
                  persist(5, {
                    daily_goal_minutes: goal,
                    pace,
                    study_days: days,
                    module_codes: modules,
                    module_exam_plans: plansPayload(),
                    revision_start: revisionStart || null,
                  })
                }
              >
                Skip for now
              </button>
            </form>
          ) : null}

          {step === 5 ? (
            <>
              <p className="onb-lede">Your exam preparation starts here!</p>
              <div className="onb-ready">
                <p>
                  <span>Exam dates</span>
                  <strong>
                    {modules
                      .map((code) => {
                        const plan = planFor(code);
                        const sitting = sittingFor(code, plan.examType);
                        if (sitting?.examDate) return `${code} Official ${formatExamDate(sitting.examDate)}`;
                        if (sitting) return `${code} Official ${formatExamWindow(sitting.windowStart, sitting.windowEnd)}`;
                        if (plan.estimatedDate) return `${code} Estimated ${formatExamDate(plan.estimatedDate)}`;
                        return `${code} not published yet`;
                      })
                      .join(" · ")}
                  </strong>
                </p>
                <p>
                  <span>Daily goal</span>
                  <strong>{goalLabel}</strong>
                </p>
                <p>
                  <span>Pace</span>
                  <strong>{PACE_OPTIONS.find((item) => item.id === pace)?.title ?? pace}</strong>
                </p>
                <ul>
                  {modules.map((code) => {
                    const mod = SEMESTER_MODULES.find((item) => item.code === code);
                    return <li key={code}>{mod ? `${mod.code} — ${mod.name}` : code}</li>;
                  })}
                </ul>
              </div>
              {first ? (
                <article className="onb-task">
                  <p className="onb-kicker">First recommended task</p>
                  <h2>
                    {first.code} — {first.name}
                  </h2>
                  <p>Learn one topic and complete a short quiz.</p>
                </article>
              ) : null}
              <button type="button" className="onb-cta" disabled={busy} onClick={finish}>
                Go to my dashboard
              </button>
            </>
          ) : null}

          {step > 1 && step < 5 ? (
            <button type="button" className="onb-back" disabled={busy} onClick={() => setStep((current) => (current - 1) as Step)}>
              Back
            </button>
          ) : null}
        </section>
      </div>
    </div>
  );
}
