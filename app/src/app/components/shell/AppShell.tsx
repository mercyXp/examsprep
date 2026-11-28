"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import BrandLogo from "@/app/components/ui/BrandLogo";
import ThemeToggle from "@/app/components/ui/ThemeToggle";
import { getSessionUser, isStaffRole, signOut, type SessionUser } from "@/lib/auth";
import { loadScope, type AdminScope } from "@/lib/cms";
import { NavIcon, type NavIconName } from "./NavIcon";

type Variant = "student" | "admin";

const STUDENT_NAV: { href: string; label: string; icon: NavIconName }[] = [
  { href: "/dashboard", label: "Dashboard", icon: "home" },
  { href: "/dashboard/programmes", label: "Programmes", icon: "programs" },
  { href: "/dashboard/courses", label: "My Courses", icon: "book" },
  { href: "/dashboard/planner", label: "Study Planner", icon: "cal" },
  { href: "/dashboard/quizzes", label: "Quizzes & Mock Exams", icon: "quiz" },
  { href: "/dashboard/practice", label: "Practice", icon: "cards" },
  { href: "/dashboard/snap", label: "Snap a Question", icon: "camera" },
  { href: "/dashboard/flashcards", label: "Flashcards", icon: "cards" },
  { href: "/dashboard/progress", label: "Progress & Analytics", icon: "chart" },
  { href: "/dashboard/assistant", label: "Study Assistant", icon: "spark" },
  { href: "/dashboard/notifications", label: "Notifications", icon: "bell" },
  { href: "/dashboard/settings", label: "Settings", icon: "gear" },
];

type NavLink = {
  href: string;
  label: string;
  icon: NavIconName;
  show?: (scope: AdminScope | null) => boolean;
};

const ADMIN_SECTIONS: { label: string; items: NavLink[] }[] = [
  {
    label: "Overview",
    items: [{ href: "/admin", label: "Dashboard", icon: "home" }],
  },
  {
    label: "Content",
    items: [
      {
        href: "/admin/programs",
        label: "Programs",
        icon: "programs",
        show: (scope) => Boolean(scope?.canManageCatalogue),
      },
      { href: "/admin/courses", label: "Courses & Modules", icon: "book" },
      { href: "/admin/lessons", label: "Lessons", icon: "lessons" },
      { href: "/admin/questions", label: "Question Bank", icon: "bank" },
      { href: "/admin/quizzes", label: "Quizzes & Mock Exams", icon: "quiz" },
    ],
  },
  {
    label: "People",
    items: [
      {
        href: "/admin/people",
        label: "People",
        icon: "people",
        show: (scope) => Boolean(scope?.canManageStudents),
      },
    ],
  },
  {
    label: "Engage",
    items: [
      {
        href: "/admin/announcements",
        label: "Announcements",
        icon: "megaphone",
        show: (scope) => Boolean(scope?.canAnnounce),
      },
      {
        href: "/admin/rewards",
        label: "Rewards",
        icon: "award",
        show: (scope) => Boolean(scope?.canViewRewards),
      },
    ],
  },
  {
    label: "Settings",
    items: [{ href: "/admin/settings", label: "Settings", icon: "gear" }],
  },
];

function initials(user: SessionUser | null) {
  const name = user?.name?.trim() || user?.email || "EP";
  const parts = name.split(/[\s@]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "E") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function roleLabel(user: SessionUser | null) {
  const roles = user?.roles ?? [];
  if (roles.includes("super_administrator")) return "Super administrator";
  if (roles.includes("administrator")) return "Program administrator";
  if (roles.includes("creator")) return "Content creator";
  return "Student";
}

function navActive(href: string, pathname: string) {
  if (href === "/dashboard" || href === "/admin") return pathname === href;
  if (href === "/admin/people") {
    return (
      pathname === href ||
      pathname.startsWith(`${href}/`) ||
      pathname === "/admin/students" ||
      pathname.startsWith("/admin/students/") ||
      pathname === "/admin/staff" ||
      pathname.startsWith("/admin/staff/")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppShell({
  variant,
  title,
  subtitle,
  actions,
  layout = "default",
  children,
}: {
  variant: Variant;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  layout?: "default" | "studio";
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [scope, setScope] = useState<AdminScope | null>(null);
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSessionUser().then((session) => {
      if (cancelled) return;
      if (!session) {
        router.replace("/login");
        return;
      }
      const staff = isStaffRole(session.roles);
      if (variant === "admin" && !staff) {
        router.replace(session.onboardingCompleted ? "/dashboard" : "/onboarding");
        return;
      }
      if (variant === "student" && !session.onboardingCompleted && !staff) {
        router.replace("/onboarding");
        return;
      }
      setUser(session);
      if (variant === "admin") {
        loadScope().then((result) => {
          if (!cancelled && result.ok) setScope(result.data);
          if (!cancelled) setReady(true);
        });
        return;
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [router, variant]);

  const sections =
    variant === "admin"
      ? ADMIN_SECTIONS.map((section) => ({
          ...section,
          items: section.items.filter((item) => !item.show || item.show(scope)),
        })).filter((section) => section.items.length > 0)
      : [{ label: "", items: STUDENT_NAV }];

  const home = variant === "admin" ? "/admin" : "/dashboard";

  if (!ready) {
    return (
      <div className={`dash-shell${layout === "studio" ? " is-studio" : ""}`}>
        <div className="dash-main">
          <p className="dash-empty">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  if (layout === "studio") {
    return <div className="dash-shell is-studio">{children}</div>;
  }

  return (
    <div className={`dash-shell${menuOpen ? " is-open" : ""}`}>
      <button type="button" className="dash-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
      <aside className="dash-sidebar" id="dash-nav">
        <BrandLogo href={home} className="dash-brand" />
        <nav className="dash-nav" aria-label={variant === "admin" ? "Administrator" : "Student"}>
          {sections.map((section) => (
            <div key={section.label || "student"} className="dash-nav-group">
              {section.label ? <p className="dash-nav-label">{section.label}</p> : null}
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={navActive(item.href, pathname) ? "is-active" : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  <NavIcon name={item.icon} />
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="dash-account">
          <div className="dash-account-who">
            <span className="dash-avatar" aria-hidden="true">
              {initials(user)}
            </span>
            <span>
              <strong>{user?.name || user?.email}</strong>
              <em>{roleLabel(user)}</em>
            </span>
          </div>
          <div className="dash-side-tools">
            <ThemeToggle />
            <button
              type="button"
              className="dash-icon-btn"
              onClick={async () => {
                await signOut();
                router.replace("/login");
              }}
            >
              <span className="sr-only">Sign out</span>
              <NavIcon name="logout" />
            </button>
          </div>
        </div>
      </aside>
      <div className="dash-main">
        <header className="dash-top is-shell">
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
          {title ? (
            <div className="dash-hello">
              <h1>{title}</h1>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
          ) : (
            <div />
          )}
          {actions ? <div className="dash-top-actions">{actions}</div> : <div />}
        </header>
        {children}
      </div>
    </div>
  );
}
