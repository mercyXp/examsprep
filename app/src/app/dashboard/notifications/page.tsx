"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import type { AnnouncementRow } from "@/lib/cms";
import { loadExamSchedule, loadStudentAnnouncements, markAnnouncementRead, type StudentExamReminder } from "@/lib/learn-api";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(iso?: string | null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!match) return "";
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return "";
  return `${Number(match[3])} ${month} ${match[1]}`;
}

function clock(value?: string | null) {
  if (!value) return "";
  const [hourText, minuteText = "00"] = value.split(":");
  const hour = Number(hourText);
  if (!Number.isFinite(hour)) return "";
  const display = hour % 12 || 12;
  return `${display}:${minuteText.slice(0, 2).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

function daysLeft(iso: string, now: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const exam = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = new Date(now);
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((exam - start) / 86400000);
}

function leftLabel(days: number) {
  if (days < 0) return "Exam passed";
  if (days === 0) return "Exam day";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

function reminderLine(item: StudentExamReminder) {
  const when = shortDate(item.examDate);
  const time = clock(item.examTime);
  const sitting = [when, time].filter(Boolean).join(", ");
  if (!sitting) return "No published sitting yet";
  if (item.source === "estimated") return `Estimated · ${sitting}`;
  return `Exam · ${sitting}`;
}

function MegaphoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 10v4h3l5 3V7L7 10H4zM16 9.5a3.5 3.5 0 0 1 0 5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14 3.5V8h4.5M8 12h8M8 16h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3.5V7M16 3.5V7M4 10h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6zM12 15v5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v4.5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function NotificationsPage() {
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [reminders, setReminders] = useState<StudentExamReminder[]>([]);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    loadStudentAnnouncements().then((result) => {
      if (result.ok) setAnnouncements(result.data);
    });
    loadExamSchedule().then((result) => {
      if (result.ok) setReminders(result.data.reminders);
    });
  }, []);

  async function openAnnouncement(item: AnnouncementRow) {
    if (!item.read) {
      setAnnouncements((current) => current.map((row) => (row.id === item.id ? { ...row, read: true } : row)));
      await markAnnouncementRead(item.id);
    }
  }

  return (
    <AppShell variant="student" title="Notifications" subtitle="Important updates and study reminders.">
      <div className="note-page">
        <section>
          <h2>Announcements</h2>
          {announcements.length ? (
            <div className="note-list">
              {announcements.map((item) => {
                const important = item.priority !== "normal" || item.isPinned;
                const label = item.priority === "urgent" ? "Urgent" : "Important";
                const body = (
                  <>
                    <span className="note-mark">{item.kind === "course" ? <NoteIcon /> : <MegaphoneIcon />}</span>
                    <span className="note-copy">
                      <strong>{item.title}</strong>
                      <em>{item.message}</em>
                    </span>
                    <span className="note-meta">
                      {important ? (
                        <span className="note-pill is-important">
                          <PinIcon /> {label}
                        </span>
                      ) : null}
                      <time>{shortDate(item.publishAt || item.createdAt)}</time>
                    </span>
                  </>
                );
                const className = `note-card${important ? " is-accent" : ""}`;
                if (item.link) {
                  return (
                    <Link key={item.id} href={item.link.href} className={className} onClick={() => void openAnnouncement(item)}>
                      {body}
                    </Link>
                  );
                }
                return (
                  <button key={item.id} type="button" className={className} onClick={() => void openAnnouncement(item)}>
                    {body}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="note-empty">No announcements yet.</p>
          )}
        </section>

        <section>
          <h2>Study reminders</h2>
          {reminders.length ? (
            <div className="note-list">
              {reminders.map((item) => {
                const days = item.examDate && now != null ? daysLeft(item.examDate, now) : null;
                return (
                  <Link key={`${item.code}-${item.examDate}`} href="/dashboard/planner" className="note-card">
                    <span className="note-mark">
                      <CalendarIcon />
                    </span>
                    <span className="note-copy">
                      <strong>
                        {item.code} · {item.name}
                      </strong>
                      <em>{reminderLine(item)}</em>
                    </span>
                    <span className="note-meta">
                      {days != null ? (
                        <span className="note-pill">
                          <ClockIcon /> {leftLabel(days)}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="note-empty">Study reminders appear when your modules have exam dates.</p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
