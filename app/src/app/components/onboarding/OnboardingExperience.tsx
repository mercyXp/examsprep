"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ExamDatePicker } from "@/app/components/ui/ExamCalendar";
import ThemeToggle from "@/app/components/ui/ThemeToggle";
import { computingModules, programmeByName, programmeBySlug, studyProgrammes } from "@/data/programmes";
import { getSessionUser, saveOnboarding, type SessionUser } from "@/lib/auth";
import {
  GOAL_OPTIONS,
  PACE_OPTIONS,
  SEMESTER_MODULES,
  STUDY_DAYS,
  formatExamDate,
  formatGoal,
  recommendedModule,
  normalizeExamDates,
  todayISO,
} from "@/lib/study";

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
  const [examDates, setExamDates] = useState<string[]>([]);

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
      setExamDates(session.onboardingStep >= 4 ? normalizeExamDates(session.examDates, session.examDate) : []);
      const resume = Math.min(5, Math.max(1, session.onboardingStep)) as Step;
      setStep(resume);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

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
    if (!programmeName || !year || !semester || !examDates.length) return;
    setBusy(true);
    try {
      await saveOnboarding({
        name,
        university,
        programme: programmeName,
        year_of_study: year,
        semester_of_study: semester,
        exam_date: examDates[0],
        exam_dates: examDates,
        daily_goal_minutes: goal,
        pace,
        study_days: days,
        module_codes: modules,
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
        <Link href="/" className="logo onb-brand" aria-label="ExamsPrep home">
          <span className="logo-crop theme-light">
            <Image
              src="/logo/logo_light.png"
              alt=""
              width={2336}
              height={908}
              priority
              className="logo-lockup"
            />
          </span>
          <span className="logo-dark theme-dark">
            <Image src="/logo/mark.png" alt="" width={340} height={340} priority className="logo-mark" />
            <span className="logo-wordmark" aria-hidden="true">
              ExamPrep
            </span>
          </span>
        </Link>
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
                if (!examDates.length) return;
                persist(5, {
                  exam_date: examDates[0],
                  exam_dates: examDates,
                  daily_goal_minutes: goal,
                  pace,
                  study_days: days,
                  module_codes: modules,
                });
              }}
            >
              <p className="onb-lede">Select every exam date from the calendar, then set a daily goal and study rhythm.</p>
              <div className="onb-cal">
                <p id="onb-exam-label">Exam dates</p>
                <ExamDatePicker values={examDates} min={todayISO()} labelledBy="onb-exam-label" onChange={setExamDates} />
              </div>
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
              <button type="submit" className="onb-cta" disabled={busy || !examDates.length}>
                Build my study plan
              </button>
              <button
                type="button"
                className="onb-skip"
                disabled={busy || !examDates.length}
                onClick={() =>
                  persist(5, {
                    exam_date: examDates[0],
                    exam_dates: examDates,
                    daily_goal_minutes: goal,
                    pace,
                    study_days: days,
                    module_codes: modules,
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
                  <strong>{examDates.map((iso) => formatExamDate(iso)).join(" · ") || "Not selected"}</strong>
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
