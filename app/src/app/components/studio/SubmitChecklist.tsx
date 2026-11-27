"use client";

import type { QualityWarning } from "@/lib/quality";

export function SubmitChecklist({ warnings, onDismiss }: { warnings: QualityWarning[]; onDismiss: () => void }) {
  if (!warnings.length) return null;
  return (
    <section className="studio-checklist" aria-label="Before you submit">
      <header>
        <strong>Before you submit</strong>
        <span>
          {warnings.length} {warnings.length === 1 ? "item" : "items"}
        </span>
        <button type="button" onClick={onDismiss}>
          Dismiss
        </button>
      </header>
      <ul>
        {warnings.map((warning) => (
          <li key={`${warning.code}-${warning.slideId}-${warning.blockId}-${warning.message}`}>{warning.message}</li>
        ))}
      </ul>
    </section>
  );
}
