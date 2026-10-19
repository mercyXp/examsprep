import { Suspense } from "react";
import Link from "next/link";
import { computingMeta } from "@/data/programmes";
import ModuleExplorer from "@/app/components/programmes/ModuleExplorer";

export default function ComputingProgrammePage() {
  return (
    <section className="programme-page" aria-labelledby="programme-title">
      <p className="features-kicker">{computingMeta.kicker}</p>
      <h1 id="programme-title" className="programme-title">
        {computingMeta.title}
      </h1>
      <p className="programme-lede">{computingMeta.overview}</p>

      <dl className="programme-stats">
        <div>
          <dt>Duration</dt>
          <dd>{computingMeta.years} years</dd>
        </div>
        <div>
          <dt>Semesters</dt>
          <dd>{computingMeta.semesters}</dd>
        </div>
        <div>
          <dt>Credits listed</dt>
          <dd>{computingMeta.creditsListed.toLocaleString("en-GB")}</dd>
        </div>
      </dl>

      <p className="programme-entry">
        <strong>Entry.</strong> {computingMeta.entry}
      </p>

      <Suspense>
        <ModuleExplorer />
      </Suspense>

      <p className="programme-back">
        <Link href="/#programmes" className="features-more">
          All programmes
        </Link>
      </p>
    </section>
  );
}
