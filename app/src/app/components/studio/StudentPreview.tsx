"use client";

import { SlideStage } from "@/app/components/learn/SlideStage";
import { initialRevealCount, unitsForSlide, type Slide } from "@/lib/content";
import { useEffect, useState } from "react";

export function StudentPreview({
  slide,
  size,
  onSize,
}: {
  slide: Slide;
  size: "phone" | "desktop";
  onSize: (size: "phone" | "desktop") => void;
}) {
  const [revealed, setRevealed] = useState(() => initialRevealCount(slide));
  const total = unitsForSlide(slide).length;

  useEffect(() => {
    setRevealed(initialRevealCount(slide));
  }, [slide]);

  return (
    <aside className={`studio-live is-${size}`}>
      <div className="studio-live-bar">
        <strong>Student preview</strong>
        <div className="studio-mode">
          <button type="button" className={size === "phone" ? "is-on" : undefined} onClick={() => onSize("phone")}>
            Phone
          </button>
          <button type="button" className={size === "desktop" ? "is-on" : undefined} onClick={() => onSize("desktop")}>
            Desktop
          </button>
        </div>
      </div>
      <div className="studio-live-frame">
        <SlideStage
          slide={slide}
          revealed={revealed}
          interactive
          numbered
          onAdvance={() => setRevealed((count) => Math.min(count + 1, Math.max(total, 1)))}
        />
      </div>
    </aside>
  );
}
