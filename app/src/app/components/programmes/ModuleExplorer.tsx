"use client";

import { useMemo, useState } from "react";
import { computingModules } from "@/data/programmes";

const YEARS = [1, 2, 3, 4] as const;
const SEMESTERS = [1, 2] as const;

export default function ModuleExplorer() {
  const [year, setYear] = useState<1 | 2 | 3 | 4>(2);
  const [semester, setSemester] = useState<1 | 2>(1);
  const modules = useMemo(() => computingModules[`${year}-${semester}`] ?? [], [year, semester]);

  return (
    <div className="module-explorer" id="modules">
      <header className="module-explorer-head">
        <h2>Explore modules</h2>
        <p>Choose your year and semester.</p>
      </header>

      <div className="module-filters" role="group" aria-label="Academic year">
        {YEARS.map((item) => (
          <button
            key={item}
            type="button"
            className={item === year ? "module-chip is-on" : "module-chip"}
            aria-pressed={item === year}
            onClick={() => setYear(item)}
          >
            Year {item}
          </button>
        ))}
      </div>
      <div className="module-filters" role="group" aria-label="Semester">
        {SEMESTERS.map((item) => (
          <button
            key={item}
            type="button"
            className={item === semester ? "module-chip is-on" : "module-chip"}
            aria-pressed={item === semester}
            onClick={() => setSemester(item)}
          >
            Semester {item}
          </button>
        ))}
      </div>

      <h3 className="module-term">
        Year {year} · Semester {semester}
        <span>{modules.length ? `${modules.length} modules` : "Not listed yet"}</span>
      </h3>

      {modules.length ? (
        <ul className="module-list">
          {modules.map((mod) => (
            <li key={mod.code}>
              <article className="module-card">
                <p className="module-code">{mod.code}</p>
                <h4>{mod.name}</h4>
                <p className="module-soon">Study workspace coming next</p>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <p className="module-empty">
          Official modules for this semester will appear here as content is ready. Year 2 Semester 1 is listed from the Computing curriculum.
        </p>
      )}
    </div>
  );
}
