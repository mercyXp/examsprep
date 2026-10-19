import Image from "next/image";
import Button from "@/app/components/ui/Button";
import HeroGrades from "@/app/components/landing/HeroGrades";

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

export default function Hero() {
  return (
    <section className="hero-panel" id="get-started" aria-labelledby="hero-title">
      <HeroGrades />
      <div className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow rise-in">Hey,</p>
          <h1 id="hero-title" className="hero-title rise-in delay-1">
            <span className="title-line">Your Exam Prep</span>
            <span className="title-line">starts here</span>
          </h1>
          <p className="lede rise-in delay-2">
            Structured revision, personalized study plans, and AI coaching — built for Cavendish University Zambia students.
          </p>
          <div className="hero-actions rise-in delay-3">
            <Button href="#get-started">
              Get started
              <ArrowIcon />
            </Button>
          </div>
          <p className="account-line rise-in delay-4" id="sign-in">
            Already have an account?{" "}
            <a className="text-link" href="#sign-in">
              Sign in
            </a>
          </p>
        </div>

        <div className="hero-art rise-in delay-2">
          <Image
            src="/img/hero.png"
            alt="A student revising at a laptop, with a study plan, 73% progress, and a note from the AI coach."
            width={1536}
            height={1024}
            priority
            sizes="(min-width: 1024px) 480px, 100vw"
          />
        </div>
      </div>
    </section>
  );
}
