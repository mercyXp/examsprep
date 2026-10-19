"use client";

import Link from "next/link";
import {
  useCallback,
  useState,
  type AnimationEvent,
  type ButtonHTMLAttributes,
  type MouseEventHandler,
  type PointerEvent,
  type ReactNode,
} from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost";

type Ripple = {
  id: number;
  x: number;
  y: number;
};

type Props = {
  variant?: Variant;
  className?: string;
  children: ReactNode;
  href?: string;
  onClick?: MouseEventHandler<HTMLElement>;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children" | "onClick">;

let rippleSeq = 0;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function Button({
  variant = "primary",
  className,
  children,
  href,
  type = "button",
  onClick,
  disabled,
  ...rest
}: Props) {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const classes = ["btn", `btn-${variant}`, className].filter(Boolean).join(" ");

  const spawnRipple = useCallback((event: PointerEvent<HTMLElement>) => {
    if (disabled || event.button !== 0 || prefersReducedMotion()) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const next: Ripple = {
      id: ++rippleSeq,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    setRipples((list) => [...list, next]);
  }, [disabled]);

  const clearRipple = useCallback((id: number, event: AnimationEvent<HTMLSpanElement>) => {
    if (event.animationName !== "btn-ripple-ring") return;
    const ring = event.currentTarget;
    if (ring !== ring.parentElement?.lastElementChild) return;
    setRipples((list) => list.filter((item) => item.id !== id));
  }, []);

  const effects = (
    <>
      <span className="btn-fx" aria-hidden="true">
        {ripples.map((ripple) => (
          <span
            key={ripple.id}
            className="btn-ripple"
            style={{ left: ripple.x, top: ripple.y }}
          >
            <span className="btn-ripple-ring" onAnimationEnd={(event) => clearRipple(ripple.id, event)} />
            <span className="btn-ripple-ring" onAnimationEnd={(event) => clearRipple(ripple.id, event)} />
            <span className="btn-ripple-ring" onAnimationEnd={(event) => clearRipple(ripple.id, event)} />
          </span>
        ))}
      </span>
      <span className="btn-label">{children}</span>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={classes}
        aria-disabled={disabled || undefined}
        onClick={onClick}
        onPointerDown={spawnRipple}
      >
        {effects}
      </Link>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={spawnRipple}
      {...rest}
    >
      {effects}
    </button>
  );
}
