"use client";

import { useEffect, useRef, useState } from "react";
import { AudioPlayer } from "@/app/components/assist/AudioPlayer";
import { MathMarkdown } from "@/app/components/assist/MathMarkdown";
import { proxyMedia } from "@/lib/assist";
import { api } from "@/lib/api";
import { loadCourses, type CourseSummary } from "@/lib/learn-api";

type Turn = { id: string; role: string; text: string; audioUrl: string | null };

export function VoiceTutor() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [moduleId, setModuleId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    loadCourses().then((result) => {
      if (result.ok) setCourses(result.data);
    });
  }, []);

  async function ensureSession() {
    if (sessionId) return sessionId;
    const result = await api<{ id: string; turns: Turn[] }>("/api/learn/tutor/sessions", {
      method: "POST",
      body: JSON.stringify({ module_id: moduleId || null }),
    });
    if (!result.ok) {
      setError(result.message);
      return "";
    }
    setSessionId(result.data.id);
    setTurns(result.data.turns || []);
    return result.data.id;
  }

  async function toggle() {
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      return;
    }
    setError("");
    setNotice("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot record from the microphone.");
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
    if (!stream) {
      setError("Microphone permission was denied.");
      return;
    }
    const media = new MediaRecorder(stream);
    chunks.current = [];
    media.ondataavailable = (event) => {
      if (event.data.size) chunks.current.push(event.data);
    };
    media.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks.current, { type: media.mimeType || "audio/webm" });
      void send(blob);
    };
    recorder.current = media;
    media.start();
    setRecording(true);
  }

  async function send(blob: Blob) {
    const id = await ensureSession();
    if (!id) return;
    setBusy(true);
    const body = new FormData();
    body.set("audio", blob, "question.webm");
    const response = await fetch(`/api/learn/tutor/sessions/${id}/turns`, { method: "POST", body });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      transcript?: string;
      answer?: string | null;
      audio?: { url?: string } | null;
    } | null;
    setBusy(false);
    if (!response.ok || payload?.ok === false) {
      setError(payload?.message || "The voice tutor could not answer.");
      return;
    }
    if (payload?.message) setNotice(payload.message);
    const history = await api<{ turns: Turn[] }>(`/api/learn/tutor/sessions/${id}`);
    if (history.ok) setTurns(history.data.turns || []);
  }

  return (
    <article className="dash-card assist-panel">
      <header className="dash-card-head">
        <h2>Voice tutor</h2>
      </header>
      <p>Record a question. Speech is transcribed, answered from the selected course, then read back. Nothing is invented when a key is missing.</p>
      <label>
        Course context
        <select
          value={moduleId}
          onChange={(event) => {
            setModuleId(event.target.value);
            setSessionId("");
            setTurns([]);
          }}
        >
          <option value="">No specific course</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.code} — {course.name}
            </option>
          ))}
        </select>
      </label>
      <div className="studio-author-actions">
        <button type="button" onClick={() => void toggle()} disabled={busy}>
          {recording ? "Stop and send" : busy ? "Working…" : "Record"}
        </button>
        <span>{recording ? "Recording…" : busy ? "Transcribing…" : "Ready"}</span>
      </div>
      {error ? <p className="cms-error" role="alert">{error}</p> : null}
      {notice ? <p>{notice}</p> : null}
      <ol className="assist-turns">
        {turns.map((turn) => (
          <li key={turn.id}>
            <strong>{turn.role === "assistant" ? "Tutor" : "You"}</strong>
            <MathMarkdown text={turn.text} />
            {turn.audioUrl ? <AudioPlayer src={proxyMedia(turn.audioUrl)} label="Tutor reply" /> : null}
          </li>
        ))}
      </ol>
    </article>
  );
}
