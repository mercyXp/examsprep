"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { computingModules } from "@/data/programmes";
import { getSessionUser, signOut, type SessionUser } from "@/lib/auth";
import ThemeToggle from "../ui/ThemeToggle";

const EXAM_DATE = new Date("2026-11-23T00:00:00");
const MODULES = computingModules["2-1"] ?? [];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const NAV = [
  { id: "home", label: "Dashboard", href: "/dashboard", icon: "home" },
  { id: "courses", label: "My Courses", href: "#dash-courses", icon: "book" },
  { id: "planner", label: "Study Planner", href: "#dash-goal", icon: "cal" },
  { id: "practice", label: "Practice Exams", href: "#dash-exams", icon: "quiz" },
  { id: "assistant", label: "AI Assistant", href: "#dash-ai", icon: "spark" },
  { id: "progress", label: "Progress & Analytics", href: "#dash-analytics", icon: "chart" },
  { id: "resources", label: "Resources", href: "#dash-resources", icon: "folder" },
] as const;

function daysUntilExam() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((EXAM_DATE.getTime() - now.getTime()) / 86400000));
}

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

function formatExamDate() {
  return EXAM_DATE.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
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

  useEffect(() => {
    let cancelled = false;
    getSessionUser().then((session) => {
      if (cancelled) return;
      if (!session) {
        router.replace("/login");
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

  const remaining = useMemo(() => daysUntilExam(), []);
  const examLabel = useMemo(() => formatExamDate(), []);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return MODULES;
    return MODULES.filter((mod) => `${mod.code} ${mod.name}`.toLowerCase().includes(needle));
  }, [query]);

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  if (!ready) {
    return (
      <div className="dash-boot" aria-busy="true">
        <p>Loading your dashboard…</p>
      </div>
    );
  }

  const name = firstName(user);
  const continueModule = MODULES[0];

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
              className={item.id === "home" ? "is-active" : undefined}
              onClick={() => setMenuOpen(false)}
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
            <h1>
              Hey {name} <span aria-hidden="true">👋</span>
            </h1>
            <p>Keep going! You’re doing great. Study smart, not just hard.</p>
          </div>
        </header>

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
                <span>0m / 3h</span>
              </header>
              <p>Study for at least 3 hours today</p>
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
                      <p className="dash-kicker is-live">Not started</p>
                      <h3>
                        {continueModule.code} — {continueModule.name}
                      </h3>
                      <p>Lessons for this module aren’t published yet.</p>
                    </div>
                    <div className="dash-bar" aria-label="Module progress 0 percent">
                      <span style={{ width: "0%" }} />
                    </div>
                    <Link href="/programmes/computing" className="dash-primary">
                      Open programme
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
                  {MODULES.map((mod, index) => (
                    <li key={mod.code} className={`is-mod-${index}`}>
                      <div className="dash-exam-date">
                        <strong>23</strong>
                        <span>Nov 2026</span>
                      </div>
                      <div>
                        <h3>
                          {mod.code} — {mod.name}
                        </h3>
                        <p>
                          {examLabel} · {remaining} days left
                        </p>
                        <div className="dash-bar">
                          <span style={{ width: "0%" }} />
                        </div>
                      </div>
                      <span className="dash-plan">Study plan soon</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="dash-card" id="dash-courses">
                <header className="dash-card-head">
                  <h2>My Courses</h2>
                  <Link href="/programmes/computing">View all</Link>
                </header>
                <ul className="dash-courses">
                  {(query.trim() ? filtered : MODULES).map((mod, index) => (
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
      </div>
    </div>
  );
}
