"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { addCourse, loadCatalogue, removeCourse, type CourseCatalogue } from "@/lib/learn-api";

const YEARS = [1, 2, 3, 4] as const;

export default function ManageCoursesPage() {
  const [catalogue, setCatalogue] = useState<CourseCatalogue | null>(null);
  const [year, setYear] = useState<number | "all">("all");
  const [semester, setSemester] = useState<number | "all">("all");
  const [error, setError] = useState("");
  const [busyCode, setBusyCode] = useState("");

  useEffect(() => {
    loadCatalogue().then((result) => {
      if (result.ok) setCatalogue(result.data);
      else setError(result.message);
    });
  }, []);

  const shown = useMemo(() => {
    return (catalogue?.items ?? []).filter((item) => {
      if (year !== "all" && item.yearNumber !== year) return false;
      if (semester !== "all" && item.semesterNumber !== semester) return false;
      return true;
    });
  }, [catalogue, semester, year]);

  async function toggle(code: string, selected: boolean) {
    setError("");
    setBusyCode(code);
    const result = selected ? await removeCourse(code) : await addCourse(code);
    setBusyCode("");
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setCatalogue(result.data);
  }

  return (
    <AppShell
      variant="student"
      title="Manage my courses"
      subtitle="Choose up to seven published modules from any year or semester in your programme."
    >
      <div className="dash-body cms-stack">
        <p>
          <Link href="/dashboard/settings">Back to settings</Link>
        </p>
        {error ? <p className="cms-error">{error}</p> : null}
        <section className="settings-panel">
          <div className="course-browse-head">
            <h2>Browse courses</h2>
            <span>
              {catalogue ? `${catalogue.activeCount} of ${catalogue.limit} selected` : "Loading…"}
            </span>
          </div>
          <p className="dash-kicker">Filter by academic year</p>
          <div className="course-filters">
            <button type="button" className={year === "all" ? "is-on" : undefined} onClick={() => setYear("all")}>
              All years
            </button>
            {YEARS.map((item) => (
              <button key={item} type="button" className={year === item ? "is-on" : undefined} onClick={() => setYear(item)}>
                Year {item}
              </button>
            ))}
          </div>
          <p className="dash-kicker">Filter by semester</p>
          <div className="course-filters">
            <button type="button" className={semester === "all" ? "is-on" : undefined} onClick={() => setSemester("all")}>
              All semesters
            </button>
            {[1, 2].map((item) => (
              <button
                key={item}
                type="button"
                className={semester === item ? "is-on" : undefined}
                onClick={() => setSemester(item)}
              >
                Semester {item}
              </button>
            ))}
          </div>
          {!catalogue ? <p className="dash-empty">Loading modules…</p> : null}
          {catalogue && !shown.length ? <p className="dash-empty">No published modules match these filters.</p> : null}
          <ul className="course-list">
            {shown.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>
                    {item.code} — {item.name}
                  </strong>
                  <span>
                    {item.yearNumber ? `Year ${item.yearNumber}` : "Year"} ·{" "}
                    {item.semesterNumber ? `Semester ${item.semesterNumber}` : "Semester"}
                  </span>
                </div>
                <button
                  type="button"
                  className={item.selected ? "is-added" : undefined}
                  disabled={busyCode === item.code}
                  onClick={() => toggle(item.code, item.selected)}
                >
                  {busyCode === item.code ? "Saving…" : item.selected ? "Remove" : "Add"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
