"use client";

import { useEffect, useRef, type CSSProperties } from "react";

type Grade = {
  label: "A+" | "A++";
  color: string;
  x: string;
  y: string;
  size: string;
  dx: string;
  dy: string;
  blur: string;
  alpha: number;
  duration: string;
  delay: string;
  bob: string;
  rock: string;
  ink: "black" | "color";
};

const C = {
  blue: "#3444DA",
  pink: "#E85D9A",
  grey: "#8A93A8",
  green: "#1FA971",
  violet: "#7B5CFF",
  red: "#E24B4A",
  black: "#171A2B",
} as const;

const GRADES: Grade[] = [
  { label: "A+", color: C.blue, x: "5%", y: "6%", size: "0.82rem", dx: "18", dy: "12", blur: "3.2px", alpha: 0.32, duration: "9.4s", delay: "-1.2s", bob: "9px", rock: "2.6deg", ink: "color" },
  { label: "A++", color: C.pink, x: "18%", y: "11%", size: "1.05rem", dx: "36", dy: "24", blur: "1.6px", alpha: 0.42, duration: "8.1s", delay: "-3.4s", bob: "11px", rock: "3.2deg", ink: "color" },
  { label: "A+", color: C.grey, x: "38%", y: "4%", size: "0.78rem", dx: "16", dy: "10", blur: "3.6px", alpha: 0.3, duration: "10.6s", delay: "-0.6s", bob: "8px", rock: "2.2deg", ink: "color" },
  { label: "A+", color: C.green, x: "57%", y: "8%", size: "1.38rem", dx: "58", dy: "40", blur: "0.2px", alpha: 0.58, duration: "7.6s", delay: "-4.1s", bob: "13px", rock: "3.8deg", ink: "color" },
  { label: "A++", color: C.violet, x: "73%", y: "5%", size: "0.84rem", dx: "20", dy: "14", blur: "2.8px", alpha: 0.34, duration: "11.2s", delay: "-2.2s", bob: "10px", rock: "2.8deg", ink: "color" },
  { label: "A+", color: C.red, x: "88%", y: "12%", size: "1.12rem", dx: "40", dy: "28", blur: "1.3px", alpha: 0.46, duration: "8.8s", delay: "-5.0s", bob: "12px", rock: "3.4deg", ink: "color" },
  { label: "A++", color: C.black, x: "8%", y: "24%", size: "0.76rem", dx: "14", dy: "10", blur: "3.8px", alpha: 0.28, duration: "12.0s", delay: "-1.8s", bob: "8px", rock: "2.0deg", ink: "black" },
  { label: "A+", color: C.blue, x: "92%", y: "26%", size: "1.62rem", dx: "80", dy: "54", blur: "0px", alpha: 0.62, duration: "7.3s", delay: "-2.8s", bob: "14px", rock: "4.2deg", ink: "color" },
  { label: "A+", color: C.pink, x: "62%", y: "22%", size: "0.8rem", dx: "18", dy: "12", blur: "3.1px", alpha: 0.32, duration: "9.8s", delay: "-4.6s", bob: "9px", rock: "2.5deg", ink: "color" },
  { label: "A++", color: C.grey, x: "79%", y: "20%", size: "1.28rem", dx: "52", dy: "36", blur: "0.4px", alpha: 0.54, duration: "8.4s", delay: "-0.9s", bob: "12px", rock: "3.6deg", ink: "color" },
  { label: "A+", color: C.green, x: "96%", y: "38%", size: "0.9rem", dx: "24", dy: "16", blur: "2.4px", alpha: 0.38, duration: "10.1s", delay: "-3.1s", bob: "10px", rock: "2.9deg", ink: "color" },
  { label: "A++", color: C.violet, x: "3%", y: "46%", size: "1.18rem", dx: "44", dy: "30", blur: "1.1px", alpha: 0.48, duration: "7.9s", delay: "-5.4s", bob: "11px", rock: "3.3deg", ink: "color" },
  { label: "A+", color: C.red, x: "48%", y: "38%", size: "0.74rem", dx: "14", dy: "10", blur: "3.5px", alpha: 0.28, duration: "11.6s", delay: "-2.5s", bob: "8px", rock: "2.1deg", ink: "color" },
  { label: "A+", color: C.black, x: "68%", y: "36%", size: "1.5rem", dx: "72", dy: "48", blur: "0px", alpha: 0.6, duration: "7.5s", delay: "-1.4s", bob: "14px", rock: "4.0deg", ink: "black" },
  { label: "A++", color: C.blue, x: "84%", y: "44%", size: "0.86rem", dx: "22", dy: "14", blur: "2.6px", alpha: 0.36, duration: "9.1s", delay: "-4.8s", bob: "9px", rock: "2.7deg", ink: "color" },
  { label: "A+", color: C.pink, x: "6%", y: "62%", size: "1.34rem", dx: "56", dy: "38", blur: "0.3px", alpha: 0.56, duration: "8.6s", delay: "-0.4s", bob: "13px", rock: "3.7deg", ink: "color" },
  { label: "A++", color: C.grey, x: "22%", y: "70%", size: "0.8rem", dx: "18", dy: "12", blur: "3.0px", alpha: 0.32, duration: "10.8s", delay: "-3.7s", bob: "10px", rock: "2.4deg", ink: "color" },
  { label: "A+", color: C.green, x: "41%", y: "78%", size: "1.08rem", dx: "38", dy: "26", blur: "1.5px", alpha: 0.44, duration: "8.0s", delay: "-2.0s", bob: "11px", rock: "3.1deg", ink: "color" },
  { label: "A+", color: C.violet, x: "58%", y: "70%", size: "0.76rem", dx: "16", dy: "10", blur: "3.4px", alpha: 0.3, duration: "11.4s", delay: "-5.2s", bob: "8px", rock: "2.3deg", ink: "color" },
  { label: "A++", color: C.red, x: "76%", y: "64%", size: "1.22rem", dx: "48", dy: "32", blur: "0.8px", alpha: 0.5, duration: "7.8s", delay: "-1.1s", bob: "12px", rock: "3.5deg", ink: "color" },
  { label: "A+", color: C.black, x: "91%", y: "72%", size: "0.88rem", dx: "22", dy: "16", blur: "2.5px", alpha: 0.36, duration: "9.6s", delay: "-4.3s", bob: "10px", rock: "2.8deg", ink: "black" },
  { label: "A++", color: C.blue, x: "12%", y: "86%", size: "0.78rem", dx: "16", dy: "12", blur: "3.3px", alpha: 0.3, duration: "10.4s", delay: "-2.7s", bob: "9px", rock: "2.2deg", ink: "color" },
  { label: "A+", color: C.pink, x: "33%", y: "92%", size: "1.44rem", dx: "64", dy: "44", blur: "0.15px", alpha: 0.58, duration: "7.4s", delay: "-3.9s", bob: "13px", rock: "3.9deg", ink: "color" },
  { label: "A++", color: C.grey, x: "52%", y: "88%", size: "1.0rem", dx: "34", dy: "22", blur: "1.8px", alpha: 0.42, duration: "8.9s", delay: "-0.8s", bob: "11px", rock: "3.0deg", ink: "color" },
  { label: "A+", color: C.green, x: "71%", y: "90%", size: "0.82rem", dx: "20", dy: "14", blur: "2.9px", alpha: 0.34, duration: "11.0s", delay: "-5.6s", bob: "9px", rock: "2.6deg", ink: "color" },
  { label: "A+", color: C.violet, x: "86%", y: "86%", size: "1.56rem", dx: "76", dy: "50", blur: "0px", alpha: 0.6, duration: "7.2s", delay: "-1.6s", bob: "14px", rock: "4.1deg", ink: "color" },
  { label: "A++", color: C.red, x: "27%", y: "48%", size: "0.72rem", dx: "12", dy: "8", blur: "3.7px", alpha: 0.26, duration: "12.2s", delay: "-4.0s", bob: "7px", rock: "1.9deg", ink: "color" },
  { label: "A+", color: C.black, x: "96%", y: "54%", size: "1.16rem", dx: "42", dy: "28", blur: "1.2px", alpha: 0.46, duration: "8.3s", delay: "-2.9s", bob: "12px", rock: "3.2deg", ink: "black" },
];

function finePointer() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function HeroGrades() {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const panel = layer?.closest(".hero-panel");
    if (!layer || !(panel instanceof HTMLElement)) return;

    const canParallax = () =>
      !reducedMotion() && finePointer() && window.matchMedia("(min-width: 1024px)").matches;

    let frame = 0;
    const marks = Array.from(layer.querySelectorAll<HTMLElement>(".hero-grade"));

    const setOffset = (x: number, y: number) => {
      for (const mark of marks) {
        const dx = Number.parseFloat(mark.style.getPropertyValue("--dx")) || 0;
        const dy = Number.parseFloat(mark.style.getPropertyValue("--dy")) || 0;
        mark.style.transform = `translate3d(${(x * dx).toFixed(2)}px, ${(y * dy).toFixed(2)}px, 0)`;
      }
    };

    const rest = () => {
      if (frame) cancelAnimationFrame(frame);
      setOffset(0, 0);
      if (canParallax()) layer.classList.remove("is-active");
      else layer.classList.add("is-active");
    };

    rest();

    const onMove = (event: PointerEvent) => {
      if (!canParallax()) return;
      const rect = panel.getBoundingClientRect();
      const nx = (event.clientX - rect.left) / rect.width - 0.5;
      const ny = (event.clientY - rect.top) / rect.height - 0.5;
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setOffset(nx, ny));
    };

    const onEnter = () => {
      if (canParallax()) layer.classList.add("is-active");
    };

    const onLeave = () => {
      rest();
    };

    panel.addEventListener("pointerenter", onEnter);
    panel.addEventListener("pointermove", onMove);
    panel.addEventListener("pointerleave", onLeave);
    window.addEventListener("resize", rest);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      panel.removeEventListener("pointerenter", onEnter);
      panel.removeEventListener("pointermove", onMove);
      panel.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", rest);
    };
  }, []);

  return (
    <div ref={layerRef} className="hero-grades" aria-hidden="true">
      {GRADES.map((grade, index) => (
        <span
          key={`${grade.label}-${index}`}
          className={grade.ink === "black" ? "hero-grade is-black" : "hero-grade"}
          style={
            {
              "--x": grade.x,
              "--y": grade.y,
              "--c": grade.color,
              "--size": grade.size,
              "--dx": `${grade.dx}px`,
              "--dy": `${grade.dy}px`,
              "--blur": grade.blur,
              "--alpha": String(grade.alpha),
              "--dur": grade.duration,
              "--delay": grade.delay,
              "--bob": grade.bob,
              "--rock": grade.rock,
            } as CSSProperties
          }
        >
          <span>{grade.label}</span>
        </span>
      ))}
    </div>
  );
}
