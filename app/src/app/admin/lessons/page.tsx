"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import { courseLabel, loadScope, type AdminScope } from "@/lib/cms";

function LessonsStart() {
  const router = useRouter();
  const search = useSearchParams();
  const legacyModule = search.get("module");
  const [scope, setScope] = useState<AdminScope | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [programId, setProgramId] = useState("");
  const [courseId, setCourseId] = useState("");

  useEffect(() => {
    if (!legacyModule) return;
    router.replace(`/admin/lessons/${legacyModule}`);
  }, [legacyModule, router]);

  useEffect(() => {
    let cancelled = false;
    loadScope().then((result) => {
      if (cancelled) return;
      if (!result.ok) setError(result.message);
      else setScope(result.data);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const programmes = scope?.programmes ?? [];
  const courses = useMemo(
    () => (scope?.modules ?? []).filter((item) => item.programmeId === programId),
    [scope, programId],
  );

  return (
    <AppShell variant="admin" title="Lessons" subtitle="Create and manage lessons for your courses">
      <div className="dash-body lesson-flow">
        {legacyModule ? <p className="dash-empty">Opening that course…</p> : null}
        {!legacyModule && error ? (
          <p className="cms-error" role="alert">
            {error}
          </p>
        ) : null}
        {!legacyModule && !ready ? <p className="dash-empty">Loading programs…</p> : null}
        {!legacyModule && ready && !error && programmes.length === 0 ? (
          <section className="dash-card lesson-empty-card">
            <h2>No programs yet</h2>
            <p>Create a program of study before you add lessons.</p>
            <Link className="dash-primary lesson-cta" href="/admin/programs">
              Open Programs
            </Link>
          </section>
        ) : null}
        {!legacyModule && ready && programmes.length > 0 ? (
          <section className="dash-card lesson-picker">
            <div className="lesson-picker-fields">
              <label>
                Program of Study
                <select
                  value={programId}
                  onChange={(event) => {
                    setProgramId(event.target.value);
                    setCourseId("");
                  }}
                >
                  <option value="">Select a program</option>
                  {programmes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Course
                <select value={courseId} disabled={!programId} onChange={(event) => setCourseId(event.target.value)}>
                  <option value="">{programId ? "Select a course" : "Select a program first"}</option>
                  {courses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {courseLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {programId && courses.length === 0 ? (
              <p className="lesson-empty">
                This program has no courses yet. <Link href="/admin/courses">Open Courses & Modules</Link>
              </p>
            ) : null}
            <div className="lesson-picker-actions">
              <button
                type="button"
                className="dash-primary"
                disabled={!programId || !courseId}
                onClick={() => router.push(`/admin/lessons/${courseId}`)}
              >
                Continue →
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function AdminLessonsPage() {
  return (
    <Suspense fallback={<p className="dash-empty">Loading lessons…</p>}>
      <LessonsStart />
    </Suspense>
  );
}
