"use client";

import Link from "next/link";
import { useState } from "react";
import {
  importResearch,
  loadResearchJob,
  proposeResearch,
  startResearch,
  type ResearchJob,
} from "@/lib/assist";
import type { AdminModule } from "@/lib/cms";

type CourseOption = Pick<AdminModule, "id" | "code" | "name" | "programmeId" | "programmeName">;

const TYPES = [
  { id: "article", label: "Article" },
  { id: "lecture", label: "Lecture notes" },
  { id: "syllabus", label: "Syllabus" },
  { id: "reference", label: "Reference" },
  { id: "site", label: "Course site" },
];

export function ResearchAssistant({ modules, initialModuleId = "" }: { modules: CourseOption[]; initialModuleId?: string }) {
  const programmes = uniqueProgrammes(modules);
  const initial = modules.find((item) => item.id === initialModuleId);
  const [programmeId, setProgrammeId] = useState(initial?.programmeId || programmes[0]?.id || "");
  const [moduleId, setModuleId] = useState(initialModuleId || "");
  const [contentType, setContentType] = useState("article");
  const [urls, setUrls] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<ResearchJob | null>(null);
  const [imported, setImported] = useState<ResearchJob["lessons"]>([]);
  const courses = modules.filter((item) => !programmeId || item.programmeId === programmeId);

  async function start(force = false) {
    setError("");
    setImported([]);
    const list = urls
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!programmeId || !moduleId) {
      setError("Choose a programme and a course.");
      return;
    }
    setBusy(true);
    const result = await startResearch({
      programme_id: programmeId,
      module_id: moduleId,
      urls: list,
      content_type: contentType,
      mode: "auto",
      force,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setJob(result.data);
    if (result.data.status === "running") void poll(result.data.id);
  }

  async function poll(id: string) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await wait(2000);
      const result = await loadResearchJob(id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setJob(result.data);
      if (result.data.status !== "running") return;
    }
  }

  async function outline() {
    if (!job) return;
    setBusy(true);
    setError("");
    const result = await proposeResearch(job.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setJob(result.data);
  }

  async function send() {
    if (!job) return;
    setBusy(true);
    setError("");
    const result = await importResearch(job.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setImported(result.data.lessons);
    setJob((current) => (current ? { ...current, status: "imported", lessons: result.data.lessons, published: false } : current));
  }

  return (
    <section className="studio-author assist-panel">
      <header>
        <h2>Research Assistant</h2>
        <p>Paste public URLs. Extracted lessons stay drafts in this course until someone reviews and publishes them.</p>
      </header>
      <div className="assist-grid">
        <label>
          Programme
          <select value={programmeId} onChange={(event) => { setProgrammeId(event.target.value); setModuleId(""); }}>
            <option value="">Choose a programme</option>
            {programmes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Course
          <select value={moduleId} onChange={(event) => setModuleId(event.target.value)}>
            <option value="">Choose a course</option>
            {courses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} — {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Content type
          <select value={contentType} onChange={(event) => setContentType(event.target.value)}>
            {TYPES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Public URLs
        <textarea value={urls} onChange={(event) => setUrls(event.target.value)} rows={3} placeholder="https://example.edu/it211/notes" />
      </label>
      <div className="studio-author-actions">
        <button type="button" disabled={busy} onClick={() => void start(false)}>
          {busy ? "Working…" : "Start extraction"}
        </button>
        <button type="button" disabled={busy || !urls.trim()} onClick={() => void start(true)}>
          Extract again
        </button>
      </div>
      {error ? (
        <p className="cms-error" role="alert">
          {error}
        </p>
      ) : null}
      {job ? <JobReview job={job} busy={busy} onOutline={() => void outline()} onSend={() => void send()} imported={imported} /> : null}
    </section>
  );
}

function JobReview({
  job,
  busy,
  onOutline,
  onSend,
  imported,
}: {
  job: ResearchJob;
  busy: boolean;
  onOutline: () => void;
  onSend: () => void;
  imported: ResearchJob["lessons"];
}) {
  const lessons = imported.length ? imported : job.lessons;
  return (
    <div className="assist-review">
      <p>
        Status: <strong>{job.status}</strong>
        {job.duplicate ? " · This URL set was already extracted for the course." : ""}
        {job.mode ? ` · ${job.mode}` : ""}
      </p>
      {job.note ? <p>{job.note}</p> : null}
      {job.error ? <p className="cms-error">{job.error}</p> : null}
      {job.proposalMessage ? <p>{job.proposalMessage}</p> : null}
      {job.pages.length ? (
        <ul>
          {job.pages.map((page) => (
            <li key={page.url}>
              <a href={page.url} target="_blank" rel="noreferrer">
                {page.title || page.url}
              </a>{" "}
              · {page.characters} characters
            </li>
          ))}
        </ul>
      ) : null}
      {job.proposal?.lessons?.length ? (
        <ul>
          {job.proposal.lessons.map((lesson) => (
            <li key={lesson.title}>
              {lesson.chapter ? `${lesson.chapter}: ` : ""}
              {lesson.title}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="studio-author-actions">
        <button type="button" disabled={busy || job.status === "running" || job.status === "failed" || job.status === "blocked"} onClick={onOutline}>
          Propose outline
        </button>
        <button type="button" disabled={busy || !["succeeded", "imported"].includes(job.status)} onClick={onSend}>
          Send to Lesson Studio as drafts
        </button>
      </div>
      {lessons.length ? (
        <ul>
          {lessons.map((lesson) => (
            <li key={lesson.id}>
              <Link href={`/admin/lessons/${lesson.id}/edit`}>{lesson.title || "Draft lesson"}</Link> · {lesson.status}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function uniqueProgrammes(modules: CourseOption[]) {
  const seen = new Map<string, string>();
  for (const item of modules) {
    if (item.programmeId && item.programmeName) seen.set(item.programmeId, item.programmeName);
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name }));
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
