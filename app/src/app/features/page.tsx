import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Features — ExamsPrep",
  description:
    "Study plans, quizzes, simple lessons, progress tracking, and mock exams built for Cavendish University Zambia students.",
};

const FEATURES = [
  {
    title: "Study plan",
    kicker: "Week by week",
    body: "A clear Monday-to-Sunday plan for Year II Semester I. Tick off review, practice, and assess so you always know what to open next — especially as 23 November 2026 gets closer.",
  },
  {
    title: "Quizzes & games",
    kicker: "Recall, fast",
    body: "Short quizzes and light games that make Operating Systems, Databases, and Discrete Math stick. Immediate feedback, no long sittings required.",
  },
  {
    title: "Simple lessons",
    kicker: "One idea at a time",
    body: "Bite-size notes written for Cavendish students, not a textbook dump. Each lesson is short enough to finish between classes and rich enough to revise from.",
  },
  {
    title: "Your progress",
    kicker: "See the climb",
    body: "A ringing score, weekly bars, and a quiet check when you hit your target. Watch the week fill so revision feels earned, not guessed.",
  },
  {
    title: "Mock exams",
    kicker: "Real conditions",
    body: "Timed papers that match the pressure of the real sitting. Practise pacing, flag weak topics, and walk in knowing the shape of the exam.",
  },
  {
    title: "AI coach",
    kicker: "A nudge, not a lecture",
    body: "A coach that notices when you stall, celebrates a 73% climb, and points you back to the next task — built around your plan, not generic tips.",
  },
  {
    title: "Course library",
    kicker: "Your semester",
    body: "Materials grouped the way your timetable is: Operating Systems, Databases, Discrete Math, and the rest of Year II Semester I in one library.",
  },
  {
    title: "Reminders",
    kicker: "Stay on the week",
    body: "Gentle prompts for the day you meant to revise. No spam — just enough to keep Thursday’s pulse from slipping to Sunday night.",
  },
];

export default function FeaturesPage() {
  return (
    <section className="features-page" aria-labelledby="features-page-title">
      <header className="features-page-head">
        <p className="features-kicker">What’s inside</p>
        <h1 id="features-page-title" className="features-page-title">
          Everything to feel ready.
        </h1>
        <p className="features-page-lede">
          Exam Prep for Cavendish University Zambia — structured revision, quizzes, lessons, and mock exams in one calm place.
        </p>
      </header>

      <div className="features-page-grid">
        {FEATURES.map((feature) => (
          <article key={feature.title} className="feature-card features-page-card">
            <p className="features-page-kicker">{feature.kicker}</p>
            <h2 className="feature-card-title">{feature.title}</h2>
            <p className="features-page-body">{feature.body}</p>
          </article>
        ))}
      </div>

      <p className="features-page-foot">
        <Link href="/#mock-exam" className="features-more">
          Try a mock exam
          <svg className="arrow" width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path
              d="M3.5 9h11M10 4.5 14.5 9 10 13.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </p>
    </section>
  );
}
