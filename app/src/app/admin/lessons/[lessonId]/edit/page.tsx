"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";
import AppShell from "@/app/components/shell/AppShell";
import LessonStudio from "@/app/components/studio/LessonStudio";

function LessonEditorPage() {
  const params = useParams<{ lessonId: string }>();
  return (
    <AppShell variant="admin" layout="studio">
      <LessonStudio lessonId={params.lessonId} />
    </AppShell>
  );
}

export default function LessonEditorRoute() {
  return (
    <Suspense fallback={<p className="dash-empty">Loading lesson editor…</p>}>
      <LessonEditorPage />
    </Suspense>
  );
}
