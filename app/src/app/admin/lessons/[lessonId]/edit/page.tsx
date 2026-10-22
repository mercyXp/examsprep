"use client";

import { useParams } from "next/navigation";
import AppShell from "@/app/components/shell/AppShell";
import LessonStudio from "@/app/components/studio/LessonStudio";

export default function LessonEditorPage() {
  const params = useParams<{ lessonId: string }>();
  return (
    <AppShell variant="admin" layout="studio">
      <LessonStudio lessonId={params.lessonId} />
    </AppShell>
  );
}
