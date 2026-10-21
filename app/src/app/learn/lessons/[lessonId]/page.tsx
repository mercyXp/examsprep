"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";
import LessonPlayer from "@/app/components/learn/LessonPlayer";

export default function LearnLessonPage() {
  const params = useParams<{ lessonId: string }>();
  return (
    <Suspense>
      <LessonPlayer lessonId={params.lessonId} />
    </Suspense>
  );
}
