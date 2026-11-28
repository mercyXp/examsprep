"use client";

import { useEffect, useState } from "react";
import { MathMarkdown } from "@/app/components/assist/MathMarkdown";
import { proxyMedia } from "@/lib/assist";
import { api } from "@/lib/api";

type Snap = {
  id: string;
  status: string;
  provider: string;
  message: string;
  subject: string;
  topic: string;
  question: string;
  concept: string;
  steps: string[];
  answer: string;
  similarQuestion: string;
  similarAnswer: string;
  followups: { id: string; question: string; answer: string }[];
  imageUrl: string;
};

export function SnapDesk() {
  const [items, setItems] = useState<Snap[]>([]);
  const [current, setCurrent] = useState<Snap | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [follow, setFollow] = useState("");

  useEffect(() => {
    api<{ items: Snap[] }>("/api/learn/snap").then((result) => {
      if (result.ok) setItems(result.data.items || []);
    });
  }, []);

  async function upload(file: File) {
    setError("");
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    const body = new FormData();
    body.set("image", file);
    const response = await fetch("/api/learn/snap", { method: "POST", body });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; item?: Snap } | null;
    setBusy(false);
    if (!response.ok || !payload?.item) {
      setError(payload?.message || "This photo could not be read.");
      return;
    }
    setCurrent(payload.item);
    setItems((list) => [payload.item as Snap, ...list.filter((item) => item.id !== payload.item?.id)]);
  }

  async function ask() {
    if (!current || !follow.trim()) return;
    setBusy(true);
    setError("");
    const result = await api<{ item: Snap }>(`/api/learn/snap/${current.id}/followups`, {
      method: "POST",
      body: JSON.stringify({ question: follow }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setCurrent(result.data.item);
    setFollow("");
  }

  return (
    <div className="cms-stack">
      <article className="dash-card assist-panel">
        <header className="dash-card-head">
          <h2>Upload a question</h2>
        </header>
        <p>JPEG, PNG, GIF, or WebP, up to 4 MB. Unreadable photos are rejected.</p>
        <label>
          Question photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
        {busy ? <p>Reading the photo…</p> : null}
        {error ? <p className="cms-error" role="alert">{error}</p> : null}
        {preview ? <img src={preview} alt="The photo you selected" className="snap-preview" /> : null}
        {current ? <SnapView item={current} /> : null}
        {current ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void ask();
            }}
          >
            <label>
              Follow-up
              <input value={follow} onChange={(event) => setFollow(event.target.value)} placeholder="Ask about a step" />
            </label>
            <button type="submit" disabled={busy || !follow.trim()}>
              Ask
            </button>
          </form>
        ) : null}
      </article>
      <article className="dash-card">
        <header className="dash-card-head">
          <h2>My Questions</h2>
        </header>
        {items.length ? (
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => setCurrent(item)}>
                  {item.topic || item.subject || "Saved question"} · {item.status}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="dash-empty">Photos you snap are saved here.</p>
        )}
      </article>
    </div>
  );
}

function SnapView({ item }: { item: Snap }) {
  return (
    <div className="assist-review">
      {item.message ? <p>{item.message}</p> : null}
      <p>
        {item.subject ? `${item.subject} · ` : ""}
        {item.topic}
      </p>
      <MathMarkdown text={item.question} />
      {item.concept ? <MathMarkdown text={item.concept} /> : null}
      {item.steps.length ? (
        <ol>
          {item.steps.map((step) => (
            <li key={step}>
              <MathMarkdown text={step} />
            </li>
          ))}
        </ol>
      ) : null}
      {item.answer ? (
        <p>
          <strong>Answer. </strong>
          <MathMarkdown text={item.answer} />
        </p>
      ) : null}
      {item.similarQuestion ? (
        <div>
          <h3>Similar practice</h3>
          <MathMarkdown text={item.similarQuestion} />
          {item.similarAnswer ? <MathMarkdown text={item.similarAnswer} /> : null}
        </div>
      ) : null}
      {item.followups.map((follow) => (
        <div key={follow.id}>
          <p>
            <strong>{follow.question}</strong>
          </p>
          <MathMarkdown text={follow.answer} />
        </div>
      ))}
      <img src={proxyMedia(item.imageUrl) || ""} alt="Saved question photo" className="snap-preview" />
    </div>
  );
}
