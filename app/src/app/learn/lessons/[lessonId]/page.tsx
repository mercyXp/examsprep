"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";
import LessonPlayer from "@/app/components/learn/LessonPlayer";

function LearnLessonInner() {
  const params = useParams<{ lessonId: string }>();
  return <LessonPlayer lessonId={params.lessonId} />;
}

export default function LearnLessonPage() {
  return (
    <Suspense fallback={<p className="dash-empty">Loading lesson…</p>}>
      <LearnLessonInner />
    </Suspense>
  );
}
