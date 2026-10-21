"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ANNOUNCEMENT_KINDS,
  ANNOUNCEMENT_PRIORITIES,
  deleteAnnouncement,
  saveAnnouncement,
  type AdminScope,
  type AnnouncementDraft,
  type AnnouncementRow,
} from "@/lib/cms";
import { todayISO } from "@/lib/study";

function emptyDraft(scope: AdminScope | null): AnnouncementDraft {
  const firstProgramme = scope?.programmes[0]?.id ?? "";
  const superAdmin = scope?.role === "super_administrator";
  return {
    title: "",
    message: "",
    kind: "general",
    audienceKind: superAdmin ? "all" : "programmes",
    programmeIds: superAdmin || !firstProgramme ? [] : [firstProgramme],
    moduleIds: [],
    yearOfStudy: 2,
    semesterOfStudy: 1,
    priority: "normal",
    isPinned: false,
    publishAt: todayISO(),
    expiresAt: "",
    linkKind: "",
    linkId: "",
    action: "draft",
  };
}

function fromRow(item: AnnouncementRow): AnnouncementDraft {
  return {
    title: item.title,
    message: item.message,
    kind: item.kind,
    audienceKind: item.audienceKind,
    programmeIds: item.programmeIds,
    moduleIds: item.moduleIds,
    yearOfStudy: item.yearOfStudy ?? 2,
    semesterOfStudy: item.semesterOfStudy ?? 1,
    priority: item.priority,
    isPinned: item.isPinned,
    publishAt: item.publishAt ?? todayISO(),
    expiresAt: item.expiresAt ?? "",
    linkKind: item.linkKind ?? "",
    linkId: item.linkId ?? "",
    action: "draft",
  };
}

function toggleId(current: string[], id: string) {
  return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
}

export default function AnnouncementForm({
  scope,
  item,
}: {
  scope: AdminScope | null;
  item?: AnnouncementRow | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<AnnouncementDraft>(() => (item ? fromRow(item) : emptyDraft(scope)));
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const superAdmin = scope?.role === "super_administrator";
  const programmes = scope?.programmes ?? [];
  const modules = useMemo(() => {
    const rows = scope?.modules ?? [];
    if (!draft.programmeIds.length) return rows;
    return rows.filter((row) => row.programmeId && draft.programmeIds.includes(row.programmeId));
  }, [scope, draft.programmeIds]);

  function patch(next: Partial<AnnouncementDraft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  async function submit(action: AnnouncementDraft["action"]) {
    setBusy(true);
    setError("");
    const result = await saveAnnouncement({ ...draft, action }, item?.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.replace("/admin/announcements");
  }

  async function onDelete() {
    if (!item) return;
    setBusy(true);
    const result = await deleteAnnouncement(item.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.replace("/admin/announcements");
  }

  const kindLabel = ANNOUNCEMENT_KINDS.find((entry) => entry.id === draft.kind)?.label ?? draft.kind;
  const priorityLabel = ANNOUNCEMENT_PRIORITIES.find((entry) => entry.id === draft.priority)?.label ?? draft.priority;

  return (
    <form
      className="cms-form announce-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(draft.publishAt && draft.publishAt > todayISO() ? "schedule" : "publish");
      }}
    >
      {error ? <p className="cms-error">{error}</p> : null}
      <label>
        Announcement title
        <input value={draft.title} onChange={(event) => patch({ title: event.target.value })} required maxLength={160} />
      </label>
      <label>
        Message
        <textarea value={draft.message} onChange={(event) => patch({ message: event.target.value })} rows={8} required />
      </label>
      <div className="announce-grid">
        <label>
          Announcement type
          <select value={draft.kind} onChange={(event) => patch({ kind: event.target.value as AnnouncementDraft["kind"] })}>
            {ANNOUNCEMENT_KINDS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select value={draft.priority} onChange={(event) => patch({ priority: event.target.value as AnnouncementDraft["priority"] })}>
            {ANNOUNCEMENT_PRIORITIES.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Audience</legend>
        <div className="onb-chips">
          {(superAdmin ? (["all", "programmes", "modules", "group"] as const) : (["programmes", "modules", "group"] as const)).map((kind) => (
            <button
              key={kind}
              type="button"
              className={draft.audienceKind === kind ? "is-on" : undefined}
              onClick={() => patch({ audienceKind: kind, programmeIds: kind === "all" ? [] : draft.programmeIds })}
            >
              {kind === "all" ? "All students" : kind === "programmes" ? "Selected programs" : kind === "modules" ? "Selected modules" : "Specific group"}
            </button>
          ))}
        </div>
      </fieldset>
      {draft.audienceKind !== "all" ? (
        <fieldset>
          <legend>{draft.audienceKind === "modules" ? "Modules" : "Programs"}</legend>
          <ul className="announce-picks">
            {(draft.audienceKind === "modules" ? modules : programmes).map((entry) => {
              const id = entry.id;
              const selected = draft.audienceKind === "modules" ? draft.moduleIds.includes(id) : draft.programmeIds.includes(id);
              const label = "code" in entry ? `${entry.code} — ${entry.name}` : entry.name;
              return (
                <li key={id}>
                  <label className="settings-check">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() =>
                        draft.audienceKind === "modules"
                          ? patch({ moduleIds: toggleId(draft.moduleIds, id) })
                          : patch({ programmeIds: draft.audienceKind === "group" ? [id] : toggleId(draft.programmeIds, id) })
                      }
                    />
                    {label}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ) : null}
      {draft.audienceKind === "group" ? (
        <div className="announce-grid">
          <label>
            Year
            <select value={draft.yearOfStudy ?? 2} onChange={(event) => patch({ yearOfStudy: Number(event.target.value) })}>
              {[1, 2, 3, 4].map((year) => (
                <option key={year} value={year}>
                  Year {year}
                </option>
              ))}
            </select>
          </label>
          <label>
            Semester
            <select value={draft.semesterOfStudy ?? 1} onChange={(event) => patch({ semesterOfStudy: Number(event.target.value) })}>
              <option value={1}>Semester 1</option>
              <option value={2}>Semester 2</option>
            </select>
          </label>
        </div>
      ) : null}
      <div className="announce-grid">
        <label>
          Publish date
          <input type="date" value={draft.publishAt} onChange={(event) => patch({ publishAt: event.target.value })} />
        </label>
        <label>
          Expiry date <span>optional</span>
          <input type="date" value={draft.expiresAt} onChange={(event) => patch({ expiresAt: event.target.value })} />
        </label>
      </div>
      <div className="announce-grid">
        <label>
          Related link
          <select value={draft.linkKind} onChange={(event) => patch({ linkKind: event.target.value, linkId: "" })}>
            <option value="">None</option>
            <option value="planner">Examination timetable</option>
            <option value="course">Course</option>
          </select>
        </label>
        {draft.linkKind === "course" ? (
          <label>
            Course
            <select value={draft.linkId} onChange={(event) => patch({ linkId: event.target.value })}>
              <option value="">Select a module</option>
              {(scope?.modules ?? []).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.code} — {entry.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <label className="settings-check">
        <input type="checkbox" checked={draft.isPinned} onChange={(event) => patch({ isPinned: event.target.checked })} />
        Pin at the top of the student list
      </label>

      {preview ? (
        <article className="announce-preview">
          <p className="dash-kicker">
            {kindLabel} · {priorityLabel}
          </p>
          <h3>{draft.title || "Untitled announcement"}</h3>
          <p>{draft.message || "The message appears here."}</p>
        </article>
      ) : null}

      {item ? (
        <p className="settings-note">
          Created by {item.createdByName || "an administrator"}
          {item.publishedByName ? ` · Published by ${item.publishedByName}` : ""}.
        </p>
      ) : null}

      <div className="settings-actions">
        <button type="button" className="dash-secondary" disabled={busy} onClick={() => void submit("draft")}>
          Save draft
        </button>
        <button type="button" className="dash-secondary" onClick={() => setPreview((current) => !current)}>
          {preview ? "Hide preview" : "Preview"}
        </button>
        <button type="submit" className="dash-primary" disabled={busy}>
          {draft.publishAt && draft.publishAt > todayISO() ? "Schedule" : "Publish"}
        </button>
        {item ? (
          <button type="button" className="dash-secondary" disabled={busy} onClick={() => void onDelete()}>
            Delete
          </button>
        ) : null}
      </div>
    </form>
  );
}
