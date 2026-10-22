"use client";

import { useState, type ChangeEvent } from "react";
import { uploadLessonMedia, type UploadedMedia } from "@/lib/cms";

const ACCEPT = {
  image: "image/jpeg,image/png,image/webp,image/gif",
  video: "video/mp4,video/webm",
  audio: "audio/mpeg,audio/wav",
  file: "image/jpeg,image/png,image/webp,image/gif,application/pdf",
} as const;

export function MediaUpload({
  lessonId,
  kind,
  label = "Upload from computer",
  onUploaded,
}: {
  lessonId: string;
  kind: "image" | "video" | "audio" | "file";
  label?: string;
  onUploaded: (item: UploadedMedia) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    const result = await uploadLessonMedia(lessonId, file, kind);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onUploaded(result.data);
  }

  return (
    <div className="studio-upload">
      <label className={busy ? "is-busy" : undefined}>
        {busy ? "Uploading…" : label}
        <input type="file" accept={ACCEPT[kind]} disabled={busy || !lessonId} onChange={onChange} />
      </label>
      {error ? <p className="cms-error">{error}</p> : null}
    </div>
  );
}
