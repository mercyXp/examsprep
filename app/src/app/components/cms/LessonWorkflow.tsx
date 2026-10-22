"use client";

import { publishLesson, reviewLesson, statusLabel } from "@/lib/cms";

export async function applyLessonAction(
  lessonId: string,
  _status: string,
  action: "publish" | "unpublish" | "submit" | "approve" | "reject",
) {
  if (action === "approve" || action === "reject") {
    return reviewLesson(lessonId, action);
  }
  if (action === "submit") {
    return publishLesson(lessonId, "submit");
  }
  if (action === "unpublish") {
    return publishLesson(lessonId, "unpublish");
  }
  return publishLesson(lessonId, "publish");
}

export function LessonWorkflowButtons({
  lessonId,
  status,
  canPublish,
  onDone,
  onError,
  beforeAction,
}: {
  lessonId: string;
  status: string;
  canPublish: boolean;
  onDone: (nextStatus: string) => void;
  onError: (message: string) => void;
  beforeAction?: () => Promise<boolean>;
}) {
  async function run(action: "publish" | "unpublish" | "submit" | "approve" | "reject") {
    if (beforeAction) {
      const saved = await beforeAction();
      if (!saved) return;
    }
    const result = await applyLessonAction(lessonId, status, action);
    if (!result.ok) {
      onError(result.message);
      return;
    }
    onDone(result.data.item.status);
  }

  if (canPublish) {
    return (
      <>
        {status === "IN_REVIEW" ? (
          <>
            <button type="button" className="studio-btn-publish" onClick={() => run("approve")}>
              Approve & publish
            </button>
            <button type="button" onClick={() => run("reject")}>
              Request changes
            </button>
          </>
        ) : null}
        {status === "PUBLISHED" ? (
          <button type="button" onClick={() => run("unpublish")}>
            Unpublish
          </button>
        ) : status !== "IN_REVIEW" ? (
          <button type="button" className="studio-btn-publish" onClick={() => run("publish")}>
            Publish
          </button>
        ) : null}
      </>
    );
  }

  if (status === "PUBLISHED") {
    return <span>Published</span>;
  }
  if (status === "IN_REVIEW") {
    return <span>Waiting for review</span>;
  }
  return (
    <button type="button" className="studio-btn-review" onClick={() => run("submit")}>
      Submit for Review
    </button>
  );
}

export function LessonStatusNote({ status }: { status: string }) {
  if (status === "CHANGES_REQUESTED") {
    return <p className="cms-error">Changes were requested. Update the lesson and submit it again.</p>;
  }
  if (status === "IN_REVIEW") {
    return <p className="cms-ok">This lesson is waiting for a program administrator to review it.</p>;
  }
  return null;
}

export { statusLabel };
