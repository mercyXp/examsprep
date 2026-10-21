"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import type { AnnouncementRow } from "@/lib/cms";
import { loadExamSchedule, loadStudentAnnouncements, markAnnouncementRead, type StudentExamReminder } from "@/lib/learn-api";
import { formatExamDate, formatExamTime, remainingLabel } from "@/lib/study";

function reminderCopy(item: StudentExamReminder) {
  const type = item.examTypeName ? ` ${item.examTypeName.toLowerCase()}` : "";
  if (item.official && item.source === "module") {
    return `Official${type}: ${item.code} sits on ${formatExamDate(item.examDate)}${item.examTime ? ` at ${formatExamTime(item.examTime)}` : ""}.`;
  }
  if (item.official && item.source === "program") {
    return `Official window${type}: ${item.code} starts ${formatExamDate(item.examDate)}.`;
  }
  if (item.source === "estimated") {
    return `Estimated date for ${item.code}${type}: ${formatExamDate(item.examDate)}. This is not a university date.`;
  }
  return `${item.code} does not have a published sitting yet.`;
}

export default function NotificationsPage() {
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [reminders, setReminders] = useState<StudentExamReminder[]>([]);
  const [periodName, setPeriodName] = useState("");

  useEffect(() => {
    loadStudentAnnouncements().then((result) => {
      if (result.ok) setAnnouncements(result.data);
    });
    loadExamSchedule().then((result) => {
      if (!result.ok) return;
      setReminders(result.data.reminders);
      setPeriodName(result.data.period?.name || "");
    });
  }, []);

  async function openAnnouncement(item: AnnouncementRow) {
    if (!item.read) {
      setAnnouncements((current) => current.map((row) => (row.id === item.id ? { ...row, read: true } : row)));
      await markAnnouncementRead(item.id);
    }
  }

  return (
    <AppShell variant="student" title="Notifications" subtitle="Administrator announcements appear here. Study reminders stay separate.">
      <div className="dash-body cms-stack">
        <section className="cms-stack">
          <h2 className="announce-section-title">Announcements</h2>
          {announcements.length ? (
            announcements.map((item) => (
              <article key={item.id} className={`dash-card announce-student${item.read ? "" : " is-unread"}`}>
                <header className="dash-card-head">
                  <h2>{item.title}</h2>
                  <span>
                    {item.isPinned || item.priority === "urgent" ? "Pinned · " : ""}
                    {item.priorityLabel}
                  </span>
                </header>
                <p className="dash-kicker">
                  {item.kindLabel}
                  {item.publishAt ? ` · ${formatExamDate(item.publishAt)}` : ""}
                </p>
                <p className="announce-message">{item.message}</p>
                <div className="settings-actions">
                  {item.link ? (
                    <Link href={item.link.href} className="dash-primary" onClick={() => void openAnnouncement(item)}>
                      {item.link.label}
                    </Link>
                  ) : (
                    <button type="button" className="dash-secondary" onClick={() => void openAnnouncement(item)}>
                      {item.read ? "Read" : "Mark as read"}
                    </button>
                  )}
                </div>
              </article>
            ))
          ) : (
            <article className="dash-card">
              <p>No administrator announcements are waiting for you.</p>
            </article>
          )}
        </section>

        <section className="cms-stack">
          <h2 className="announce-section-title">Study reminders</h2>
          {reminders.length ? (
            reminders.map((item) => (
              <article key={`${item.code}-${item.examDate}`} className="dash-card">
                <header className="dash-card-head">
                  <h2>
                    {item.code} — {item.name}
                  </h2>
                  <span>{remainingLabel(item.examDate)}</span>
                </header>
                <p>{reminderCopy(item)}</p>
                {periodName ? <p className="dash-empty">{periodName}</p> : null}
                <Link href="/dashboard/planner" className="dash-secondary">
                  Open examination timetable
                </Link>
              </article>
            ))
          ) : (
            <article className="dash-card">
              <p>Study reminders appear from your program and module exam dates. They are not administrator announcements.</p>
            </article>
          )}
        </section>
      </div>
    </AppShell>
  );
}
