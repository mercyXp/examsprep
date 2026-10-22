"use client";

import { useEffect, useRef } from "react";
import { lessonResources, type Slide } from "@/lib/content";
import { SlideStage, type CheckState } from "./SlideStage";

export function FullNotes({
  slides,
  checks,
  startIndex = 0,
  hideResources = false,
}: {
  slides: Slide[];
  checks?: CheckState;
  startIndex?: number;
  hideResources?: boolean;
}) {
  const resources = hideResources ? [] : lessonResources(slides);
  const startRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (startIndex > 0) startRef.current?.scrollIntoView({ block: "start" });
  }, [startIndex, slides]);

  return (
    <div className="notes-reader">
      {slides.map((slide, index) => (
        <section
          key={slide.id}
          className="notes-section"
          data-slide-index={index}
          ref={index === startIndex ? startRef : undefined}
        >
          <SlideStage slide={slide} revealed={Number.MAX_SAFE_INTEGER} notes checks={checks} />
        </section>
      ))}
      {resources.length ? (
        <aside className="notes-resources dash-card">
          <h2>Learning resources</h2>
          <ul>
            {resources.map((item) => (
              <li key={item.id}>
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer">
                    {item.title || item.url}
                  </a>
                ) : (
                  <span>{item.title}</span>
                )}
                {item.description ? <p>{item.description}</p> : null}
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
      <p className="cms-muted">Started from slide {startIndex + 1}. Presentation progress is kept when you return.</p>
    </div>
  );
}
