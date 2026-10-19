"use client";

import Image from "next/image";
import { useEffect, useRef, type CSSProperties } from "react";
import Button from "@/app/components/ui/Button";
import { featuredProgramme, upcomingGroups } from "@/data/programmes";

function ArrowIcon() {
  return (
    <svg className="arrow" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M3.5 9h11M10 4.5 14.5 9 10 13.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Programmes() {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      panel.classList.add("is-on");
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          panel.classList.add("is-on");
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(panel);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={panelRef}
      className="prog-panel"
      id="programmes"
      aria-labelledby="programmes-title"
    >
      <span id="courses" className="sr-only">
        Programmes
      </span>

      <header className="prog-head">
        <p className="features-kicker rise-in">Explore programmes</p>
        <h2 id="programmes-title" className="prog-title rise-in delay-1">
          <span className="prog-title-full">Your degree. Your goals. Your next level.</span>
          <span className="prog-title-short">Your next level.</span>
        </h2>
        <p className="prog-lede rise-in delay-2">
          Focused exam preparation around your programme, your modules, and the way you learn.
        </p>
      </header>

      <article className="prog-featured rise-in delay-3">
        <div className="prog-featured-media">
          <Image
            src="/programmes/BA_Computing.jpg"
            alt=""
            width={1536}
            height={1024}
            sizes="(min-width: 1024px) 720px, 100vw"
            className="prog-shot"
          />
          <span className="prog-pill is-live">Available now</span>
        </div>
        <div className="prog-featured-copy">
          <p className="prog-category">{featuredProgramme.category}</p>
          <h3 className="prog-featured-title">{featuredProgramme.name}</h3>
          <p className="prog-featured-blurb">{featuredProgramme.blurb}</p>
          <p className="prog-featured-blurb-short">{featuredProgramme.blurbShort}</p>
          <p className="prog-meta">
            <span>{featuredProgramme.duration}</span>
            <span>{featuredProgramme.format}</span>
          </p>
          <Button href={featuredProgramme.href} className="prog-cta">
            Explore programme
            <ArrowIcon />
          </Button>
        </div>
      </article>

      <div className="prog-soon-head rise-in delay-4">
        <h3 className="prog-soon-title">More paths</h3>
        <p className="prog-soon-flag">Coming soon</p>
      </div>

      <div className="prog-ticker" aria-label="Coming soon programmes">
        <div className="prog-ticker-track">
          {[0, 1].flatMap((copy) =>
            upcomingGroups.map((group) => (
              <article
                key={`${copy}-${group.title}`}
                className="prog-soon"
                style={{ "--glow": group.glow } as CSSProperties}
                aria-hidden={copy === 1 || undefined}
              >
                <h4>{group.title}</h4>
                <p className="prog-soon-hint">{group.hint}</p>
                <p className="prog-soon-blurb">{group.blurb}</p>
              </article>
            )),
          )}
        </div>
      </div>
    </section>
  );
}
