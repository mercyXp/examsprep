"use client";

import { useEffect, useRef } from "react";

export type CastMood = "idle" | "watch" | "cover" | "peek" | "error" | "success" | "load";
type BlobName = "purple" | "pink" | "yellow" | "orange";

type Props = {
  mood: CastMood;
  shake?: boolean;
};

const BLOBS: BlobName[] = ["purple", "pink", "yellow", "orange"];

function Face({ name, closed }: { name: BlobName; closed?: boolean }) {
  return (
    <div className={`blob-face is-${name}${closed ? " is-shut" : ""}`}>
      <span className={closed ? "blob-eye is-shut" : "blob-eye"}>
        <i className="blob-pupil" />
      </span>
      <span className={closed ? "blob-eye is-shut" : "blob-eye"}>
        <i className="blob-pupil" />
      </span>
      <span className="blob-mouth" />
    </div>
  );
}

function lookTarget(mood: CastMood): { x: number; y: number } | "away" | null {
  if (mood === "peek") return "away";

  const pick =
    mood === "load"
      ? document.querySelector<HTMLElement>(".login-submit")
      : mood === "watch"
        ? document.querySelector<HTMLElement>(".login-form input:focus") ||
          document.querySelector<HTMLElement>('input[name="email"]') ||
          document.querySelector<HTMLElement>('input[name="name"]')
        : mood === "cover"
          ? document.querySelector<HTMLElement>('input[name="password"]')
          : mood === "error"
            ? document.querySelector<HTMLElement>(".login-error")
            : null;

  if (!pick) return null;
  const rect = pick.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function aimPupils(
  pupils: HTMLElement[],
  tilts: HTMLElement[],
  point: { x: number; y: number } | "away",
  tilt: boolean,
) {
  pupils.forEach((pupil) => {
    if (pupil.parentElement?.classList.contains("is-shut")) {
      pupil.style.transform = "";
      return;
    }
    if (point === "away") {
      pupil.style.transform = "translate(-3.5px, -2px)";
      return;
    }
    const eye = pupil.parentElement;
    if (!eye) return;
    const rect = eye.getBoundingClientRect();
    const dx = point.x - (rect.left + rect.width / 2);
    const dy = point.y - (rect.top + rect.height / 2);
    const angle = Math.atan2(dy, dx);
    const dist = Math.min(6, Math.hypot(dx, dy) / 18);
    pupil.style.transform = `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`;
  });

  tilts.forEach((node) => {
    if (!tilt || point === "away") {
      node.style.transform = "";
      return;
    }
    const rect = node.getBoundingClientRect();
    const dx = (point.x - (rect.left + rect.width / 2)) / window.innerWidth;
    node.style.transform = `rotate(${dx * 10}deg)`;
  });
}

export default function LoginCast({ mood, shake }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const pupils = Array.from(root.querySelectorAll<HTMLElement>(".blob-pupil"));
    const tilts = Array.from(root.querySelectorAll<HTMLElement>(".blob-tilt"));

    const apply = (pointer?: { x: number; y: number }) => {
      const target = lookTarget(mood);
      if (target === "away") {
        aimPupils(pupils, tilts, "away", false);
        return;
      }
      const form = document.querySelector<HTMLElement>(".login-panel");
      const formRect = form?.getBoundingClientRect();
      const formPoint = formRect
        ? { x: formRect.left + formRect.width / 2, y: formRect.top + 28 }
        : null;
      const point = pointer && mood === "idle" && fine ? pointer : target || pointer || formPoint;
      if (!point) return;
      aimPupils(pupils, tilts, point, mood !== "error" && mood !== "success");
    };

    const onMove = (event: PointerEvent) => {
      if (reduced) return;
      apply({ x: event.clientX, y: event.clientY });
    };

    apply();
    if (fine) window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [mood]);

  const classes = ["login-cast is-enter", shake ? "is-shake" : ""].filter(Boolean).join(" ");

  return (
    <div ref={rootRef} className={classes} data-mood={mood} aria-hidden="true">
      {BLOBS.map((name) => (
        <div key={name} className={`blob blob-${name}`}>
          <div className="blob-enter">
            <div className="blob-float">
              <div className="blob-tilt">
                <div className="blob-flip">
                  <div className="blob-front blob-skin">
                    <Face name={name} closed={name === "orange" && mood === "peek"} />
                  </div>
                  <div className="blob-back blob-skin" />
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
