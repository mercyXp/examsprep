"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getSessionUser, saveOnboarding, signOut, type SessionUser } from "@/lib/auth";
import { daysUntil, examDateParts, formatExamDate, formatGoal, nextExamDate, recommendedModule, SEMESTER_MODULES, todayISO } from "@/lib/study";
import { ExamDatePicker } from "../ui/ExamCalendar";
import ThemeToggle from "../ui/ThemeToggle";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const NAV = [
  { id: "home", label: "Dashboard", href: "/dashboard", icon: "home" },
  { id: "courses", label: "My Courses", href: "#dash-courses", icon: "book" },
  { id: "planner", label: "Study Planner", href: "#dash-goal", icon: "cal" },
  { id: "timetable", label: "Create Exam Timetable", href: "#dash-timetable", icon: "table" },
  { id: "practice", label: "Practice Exams", href: "#dash-exams", icon: "quiz" },
  { id: "assistant", label: "AI Assistant", href: "#dash-ai", icon: "spark" },
  { id: "progress", label: "Progress & Analytics", href: "#dash-analytics", icon: "chart" },
  { id: "resources", label: "Resources", href: "#dash-resources", icon: "folder" },
] as const;

function firstName(user: SessionUser | null) {
  const name = user?.name?.trim();
  if (!name) return "there";
  return name.split(/\s+/)[0] ?? "there";
}

function initials(user: SessionUser | null) {
  const name = user?.name?.trim() || user?.email || "EP";
  const parts = name.split(/[\s@]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "E") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function shortExam(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function NavIcon({ name }: { name: (typeof NAV)[number]["icon"] }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true } as const;
  if (name === "home") {
    return (
      <svg {...common}>
        <path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "book") {
    return (
      <svg {...common}>
        <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21.5z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (name === "cal") {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "table") {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4 10h16M4 15h16M10 5v15" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (name === "quiz") {
    return (
      <svg {...common}>
        <path d="M8 7h8M8 12h5M7 4h10a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V6a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "spark") {
    return (
      <svg {...common}>
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.2 6.2l2.8 2.8M15 15l2.8 2.8M17.8 6.2 15 9M9 15l-2.8 2.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "chart") {
    return (
      <svg {...common}>
        <path d="M5 19V9M12 19V5M19 19v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M5 7h14M5 12h14M5 17h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function DashboardExperience() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [tab, setTab] = useState<"home" | "timetable">("home");

  useEffect(() => {
    let cancelled = false;
    getSessionUser().then((session) => {
      if (cancelled) return;
      if (!session) {
        router.replace("/login");
        return;
      }
      if (!session.onboardingCompleted) {
        router.replace("/onboarding");
        return;
      }
      setUser(session);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setMenuOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const apply = () => setTab(window.location.hash === "#dash-timetable" ? "timetable" : "home");
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  const modules = useMemo(() => {
    const codes = user?.moduleCodes ?? [];
    return codes.length ? SEMESTER_MODULES.filter((mod) => codes.includes(mod.code)) : SEMESTER_MODULES;
  }, [user]);
  const examDates = user?.examDates ?? [];
  const timetable = user?.examTimetable ?? {};
  const nextIso = useMemo(() => {
    const assigned = Object.values(timetable);
    return nextExamDate(assigned.length ? assigned : examDates);
  }, [examDates, timetable]);
  const remaining = useMemo(() => daysUntil(nextIso), [nextIso]);
  const goalMinutes = user?.dailyGoalMinutes ?? 60;
  const goalLabel = formatGoal(goalMinutes);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return modules;
    return modules.filter((mod) => `${mod.code} ${mod.name}`.toLowerCase().includes(needle));
  }, [query, modules]);

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  async function saveExamDates(dates: string[]) {
    const allowed = new Set(dates);
    const nextTable = Object.fromEntries(Object.entries(timetable).filter(([, day]) => allowed.has(day)));
    setUser((current) =>
      current ? { ...current, examDates: dates, examDate: dates[0] ?? current.examDate, examTimetable: nextTable } : current,
    );
    const saved = await saveOnboarding({ exam_dates: dates, exam_timetable: nextTable, exam_date: dates[0] });
    if (saved) setUser(saved);
  }

  async function assignModule(code: string, iso: string) {
    let nextTable: Record<string, string> = {};
    setUser((current) => {
      if (!current) return current;
      nextTable = { ...current.examTimetable, [code]: iso };
      return { ...current, examTimetable: nextTable };
    });
    const saved = await saveOnboarding({ exam_timetable: nextTable });
    if (saved) setUser(saved);
  }

  if (!ready) {
    return (
      <div className="dash-boot" aria-busy="true">
        <p>Loading your dashboard…</p>
      </div>
    );
  }

  const name = firstName(user);
  const continueModule = recommendedModule(user?.moduleCodes ?? []);

  return (
    <div className={`dash-shell${menuOpen ? " is-open" : ""}`}>
      <div className="dash-scrim" onClick={() => setMenuOpen(false)} hidden={!menuOpen} />

      <aside className="dash-sidebar" id="dash-nav" aria-label="Student navigation">
        <Link href="/" className="dash-brand">
          <span className="dash-brand-mark">
            <img src="/logo/mark.png" alt="" width={28} height={28} />
          </span>
          ExamsPrep
        </Link>

        <nav className="dash-nav">
          {NAV.map((item) => (
            <a
              key={item.id}
              href={item.href}
              className={
                (item.id === "timetable" && tab === "timetable") || (item.id === "home" && tab === "home") ? "is-active" : undefined
              }
              onClick={(event) => {
                if (item.id === "timetable") {
                  setTab("timetable");
                } else {
                  setTab("home");
                  if (item.id === "home" && window.location.hash) {
                    event.preventDefault();
                    history.replaceState(null, "", "/dashboard");
                  }
                }
                setMenuOpen(false);
              }}
            >
              <NavIcon name={item.icon} />
              {item.label}
            </a>
          ))}
        </nav>

        <div className="dash-promo">
          <p>Small steps every day lead to big results!</p>
        </div>

        <div className="dash-side-tools">
          <ThemeToggle />
          <button type="button" className="dash-icon-btn dash-gear" disabled>
            <span className="sr-only">Settings aren’t available yet</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M12 4.5v1.6M12 17.9v1.6M4.5 12h1.6M17.9 12h1.6M6.4 6.4l1.1 1.1M16.5 16.5l1.1 1.1M17.6 6.4l-1.1 1.1M7.5 16.5l-1.1 1.1"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </aside>

      <div className="dash-main">
        <header className="dash-top">
          <button
            type="button"
            className="dash-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="dash-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
          </button>

          <label className="dash-search">
            <span className="sr-only">Search courses</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search courses, topics, or resources…"
            />
          </label>

          <div className="dash-top-actions">
            <div className="dash-pop">
              <button
                type="button"
                className="dash-icon-btn"
                aria-label="Notifications"
                aria-expanded={notesOpen}
                onClick={() => {
                  setNotesOpen((open) => !open);
                  setAccountOpen(false);
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 16V10a6 6 0 1 1 12 0v6l1.5 2H4.5zM10 20h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {notesOpen ? (
                <div className="dash-popover" role="status">
                  No notifications yet.
                </div>
              ) : null}
            </div>

            <div className="dash-pop">
              <button
                type="button"
                className="dash-avatar"
                aria-label="Account menu"
                aria-expanded={accountOpen}
                onClick={() => {
                  setAccountOpen((open) => !open);
                  setNotesOpen(false);
                }}
              >
                {initials(user)}
              </button>
              {accountOpen ? (
                <div className="dash-popover is-account">
                  <p>
                    <strong>{user?.name}</strong>
                    <span>{user?.email}</span>
                  </p>
                  <Link href="/">Home</Link>
                  <button type="button" onClick={handleSignOut}>
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="dash-hello">
            {tab === "timetable" ? (
              <>
                <h1>Create exam timetable</h1>
                <p>Assign each selected module to its exact exam date.</p>
              </>
            ) : (
              <>
                <h1>
                  Hey {name} <span aria-hidden="true">👋</span>
                </h1>
                <p>Keep going! You’re doing great. Study smart, not just hard.</p>
              </>
            )}
          </div>
        </header>

        {tab === "timetable" ? (
          <div className="dash-body">
            <article className="dash-card dash-time" id="dash-timetable">
              <header className="dash-card-head">
                <h2>Exam dates</h2>
                <span>
                  {modules.filter((mod) => timetable[mod.code]).length}/{modules.length} modules placed
                </span>
              </header>
              <p className="dash-time-lede">Choose every exam sitting, then match modules to those dates.</p>
              <ExamDatePicker values={examDates} min={todayISO()} onChange={saveExamDates} />
              {!examDates.length ? (
                <p className="dash-empty">Add at least one exam date to build your timetable.</p>
              ) : (
                <ul className="dash-time-mods">
                  {modules.map((mod, index) => (
                    <li key={mod.code}>
                      <p>
                        <span className={`dash-mod is-mod-${index}`} aria-hidden="true" />
                        <strong>
                          {mod.code} — {mod.name}
                        </strong>
                      </p>
                      <div className="onb-chips">
                        {examDates.map((iso) => (
                          <button
                            key={iso}
                            type="button"
                            className={timetable[mod.code] === iso ? "is-on" : undefined}
                            aria-pressed={timetable[mod.code] === iso}
                            onClick={() => assignModule(mod.code, iso)}
                          >
                            {shortExam(iso)}
                          </button>
                        ))}
                      </div>
                      <small>{timetable[mod.code] ? formatExamDate(timetable[mod.code]) : "Not allocated yet"}</small>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </div>
        ) : (
        <div className="dash-body">
          <section className="dash-stats" aria-label="Study snapshot">
            <article className="dash-stat is-streak">
              <header>
                <span>Study Streak</span>
                <span className="dash-stat-ico" aria-hidden="true">🔥</span>
              </header>
              <strong>0 days</strong>
              <p>Start a lesson to begin a streak.</p>
            </article>
            <article className="dash-stat is-week">
              <header>
                <span>This Week</span>
                <span className="dash-stat-ico" aria-hidden="true">⏱</span>
              </header>
              <strong>0 hrs</strong>
              <p>No study time logged yet.</p>
            </article>
            <article className="dash-stat is-q">
              <header>
                <span>Questions Completed</span>
                <span className="dash-stat-ico" aria-hidden="true">✅</span>
              </header>
              <strong>0</strong>
              <p>Practice quizzes aren’t published yet.</p>
            </article>
            <article className="dash-stat is-score">
              <header>
                <span>Average Practice Score</span>
                <span className="dash-stat-ico" aria-hidden="true">◎</span>
              </header>
              <strong>—</strong>
              <p>Scores appear after your first attempt.</p>
            </article>
          </section>

          <section className="dash-mid">
            <article className="dash-card" id="dash-goal">
              <header className="dash-card-head">
                <h2>Daily Study Goal</h2>
                <span>0m / {goalLabel}</span>
              </header>
              <p>Study for {goalLabel} today</p>
              <div className="dash-bar" aria-label="Daily goal 0 percent">
                <span style={{ width: "0%" }} />
              </div>
              <small>0% · tracking starts when lessons go live.</small>
            </article>

            <article className="dash-ai" id="dash-ai">
              <div>
                <p className="dash-kicker">AI Study Assistant</p>
                <h2>Get personalized explanations when the tutor is connected.</h2>
                <p>Ask about a weak topic after you complete a lesson.</p>
                <button type="button" className="dash-ai-btn" disabled>
                  Ask AI
                </button>
              </div>
              <div className="dash-bot" aria-hidden="true">
                <span />
              </div>
            </article>
          </section>

          <section className="dash-lower">
            <div className="dash-col">
              <article className="dash-card" id="dash-continue">
                <header className="dash-card-head">
                  <h2>Continue Learning</h2>
                  <Link href="#dash-courses">View all</Link>
                </header>
                {continueModule ? (
                  <div className="dash-continue">
                    <div className="dash-continue-art" aria-hidden="true" />
                    <div className="dash-continue-copy">
                      <p className="dash-kicker is-live">Recommended</p>
                      <h3>
                        {continueModule.code} — {continueModule.name}
                      </h3>
                      <p className="dash-today">Today’s goal · Study for {goalLabel}</p>
                      <p>Learn one topic and complete a short quiz.</p>
                    </div>
                    <div className="dash-bar" aria-label="Module progress 0 percent">
                      <span style={{ width: "0%" }} />
                    </div>
                    <Link href="/programmes/computing" className="dash-primary">
                      Start my first lesson
                    </Link>
                  </div>
                ) : null}
                <div className="dash-actions">
                  <Link href="/programmes/computing">View course progress</Link>
                  <span>Next lesson · not scheduled</span>
                  <span>Practice quiz · coming soon</span>
                </div>
              </article>

              <article className="dash-card" id="dash-analytics">
                <header className="dash-card-head">
                  <h2>Learning Analytics</h2>
                </header>
                <div className="dash-tabs" aria-hidden="true">
                  <span className="is-on">Weekly Activity</span>
                  <span>Scores Over Time</span>
                  <span>Topics</span>
                  <span>Recommended</span>
                </div>
                <svg className="dash-chart" viewBox="0 0 320 140" role="img" aria-label="Weekly activity chart, no sessions yet">
                  <line x1="8" y1="118" x2="312" y2="118" stroke="currentColor" strokeOpacity="0.18" />
                  {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                    <circle key={day} cx={24 + day * 46} cy="118" r="4" fill="currentColor" opacity="0.35" />
                  ))}
                </svg>
                <div className="dash-chart-labels">
                  {WEEKDAYS.map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>
                <p className="dash-empty">No study sessions this week. Your first lesson will plot here.</p>
                <div className="dash-topics" id="dash-resources">
                  <div>
                    <h3>Strong Topics</h3>
                    <p>Not enough attempts yet.</p>
                  </div>
                  <div>
                    <h3>Weak Topics</h3>
                    <p>Not enough attempts yet.</p>
                  </div>
                  <div>
                    <h3>Recommended for You</h3>
                    <p>Recommendations appear after published quizzes.</p>
                  </div>
                </div>
              </article>
            </div>

            <div className="dash-col">
              <article className="dash-card" id="dash-exams">
                <header className="dash-card-head">
                  <h2>Upcoming Exams</h2>
                  <span>{remaining} days left</span>
                </header>
                <ul className="dash-exams">
                  {modules.map((mod, index) => {
                    const iso = timetable[mod.code];
                    const parts = iso ? examDateParts(iso) : null;
                    return (
                      <li key={mod.code} className={`is-mod-${index}`}>
                        <div className="dash-exam-date">
                          <strong>{parts?.day ?? "—"}</strong>
                          <span>{parts ? `${parts.month} ${parts.year}` : "Set date"}</span>
                        </div>
                        <div>
                          <h3>
                            {mod.code} — {mod.name}
                          </h3>
                          <p>
                            {iso ? `${shortExam(iso)} · ${daysUntil(iso)} days left` : "Not on the timetable yet"}
                          </p>
                          <div className="dash-bar">
                            <span style={{ width: "0%" }} />
                          </div>
                        </div>
                        <a className="dash-plan" href="#dash-timetable" onClick={() => setTab("timetable")}>
                          {iso ? "Change date" : "Create exam timetable"}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </article>

              <article className="dash-card" id="dash-courses">
                <header className="dash-card-head">
                  <h2>My Courses</h2>
                  <Link href="/programmes/computing">View all</Link>
                </header>
                <ul className="dash-courses">
                  {(query.trim() ? filtered : modules).map((mod, index) => (
                    <li key={mod.code}>
                      <span className={`dash-mod is-mod-${index}`} aria-hidden="true" />
                      <div>
                        <h3>
                          {mod.code} — {mod.name}
                        </h3>
                        <p>0 published lessons</p>
                      </div>
                      <div className="dash-course-meta">
                        <span>0%</span>
                        <div className="dash-bar">
                          <span style={{ width: "0%" }} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                {query.trim() && filtered.length === 0 ? <p className="dash-empty">No courses match that search.</p> : null}
              </article>
            </div>
          </section>
        </div>
        )}
      </div>
    </div>
  );
}
