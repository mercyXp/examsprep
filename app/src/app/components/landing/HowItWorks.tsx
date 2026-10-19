import Button from "@/app/components/ui/Button";

const STEPS = [
  { n: "01", kicker: "Explore", title: "Choose your module", text: "Find the topics you need to master." },
  { n: "02", kicker: "Learn", title: "Understand concepts", text: "Study structured notes and examples." },
  { n: "03", kicker: "Practise", title: "Test your knowledge", text: "Answer quizzes and learn from mistakes." },
  { n: "04", kicker: "Improve", title: "Track your progress", text: "Focus on the areas that need more work." },
] as const;

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

export default function HowItWorks() {
  return (
    <>
      <section className="how-panel" id="how-it-works" aria-labelledby="how-title">
        <header className="how-head">
          <p className="features-kicker">Your learning journey</p>
          <h2 id="how-title" className="how-title">
           HOW IT WORKS.
          </h2>
          <p className="how-lede">Choose a module. Learn it. Practise. Improve.</p>
        </header>

        <ol className="how-steps">
          {STEPS.map((step) => (
            <li key={step.n} className="how-step">
              <p className="how-num">
                {step.n} <span>/ {step.kicker}</span>
              </p>
              <h3>{step.title}</h3>
              <p className="how-text">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="start-panel" id="start" aria-labelledby="start-title">
        <p className="features-kicker">Get started</p>
        <h2 id="start-title" className="start-title">
          Start preparing today.
        </h2>
        <p className="start-lede">Computing exam prep for Cavendish University Zambia.</p>
        <Button href="#get-started">
          Get started
          <ArrowIcon />
        </Button>
      </section>
    </>
  );
}
