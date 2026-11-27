"use client";

import { useEffect, useState } from "react";
import {
  assistLesson,
  copyLessonTo,
  importIntoLesson,
  insertTemplate,
  loadAuthoringProvider,
  loadGames,
  loadTemplates,
  reuseGame,
  saveReusableGame,
  type LessonTemplate,
  type ReusableGame,
} from "@/lib/authoring";
import type { AdminModule } from "@/lib/cms";
import type { Slide } from "@/lib/content";

const ACTIONS = [
  { id: "summarize", label: "Revision notes" },
  { id: "flashcards", label: "Flashcards" },
  { id: "quiz", label: "Quiz" },
  { id: "game", label: "Game" },
  { id: "mock", label: "Mock exam" },
] as const;

export function AuthoringTools({
  lessonId,
  moduleId,
  modules,
  slides,
  busy,
  onBusy,
  onSlides,
  onMessage,
  onError,
}: {
  lessonId: string;
  moduleId: string;
  modules: AdminModule[];
  slides: Slide[];
  busy: boolean;
  onBusy: (value: boolean) => void;
  onSlides: (slides: Slide[], status?: string) => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [paste, setPaste] = useState("");
  const [templates, setTemplates] = useState<LessonTemplate[]>([]);
  const [games, setGames] = useState<ReusableGame[]>([]);
  const [provider, setProvider] = useState("Checking the drafting helper…");
  const [copyModule, setCopyModule] = useState("");
  const targets = modules.filter((item) => item.id !== moduleId);

  useEffect(() => {
    loadTemplates().then((result) => {
      if (result.ok) setTemplates(result.data);
    });
    loadAuthoringProvider().then((result) => {
      if (!result.ok) {
        setProvider("Draft buttons save an editable draft. They use the configured model when an API key is set, and a local draft otherwise.");
        return;
      }
      setProvider(
        result.data.configured
          ? `AI drafts use ${result.data.model || "the configured model"}. They are saved as drafts.`
          : "No AI key is configured. These buttons still write an editable draft on this computer.",
      );
    });
  }, []);

  useEffect(() => {
    if (!moduleId) return;
    loadGames(moduleId).then((result) => {
      if (result.ok) setGames(result.data);
    });
  }, [moduleId]);

  async function run(work: () => Promise<{ ok: true; slides: Slide[]; status?: string; note?: string } | { ok: false; message: string }>) {
    onBusy(true);
    onError("");
    const result = await work();
    onBusy(false);
    if (!result.ok) {
      onError(result.message);
      return;
    }
    onSlides(result.slides, result.status);
    if (result.note) onMessage(result.note);
  }

  return (
    <section className="studio-author">
      <header>
        <h2>Create from notes</h2>
        <p>{provider}</p>
      </header>
      <label>
        Paste lecture notes
        <textarea value={paste} onChange={(event) => setPaste(event.target.value)} placeholder="Paste headings, bullets, tables, or HTML" rows={4} />
      </label>
      <div className="studio-author-actions">
        <button
          type="button"
          disabled={busy || !paste.trim()}
          onClick={() =>
            run(async () => {
              const result = await importIntoLesson(lessonId, null, paste, "append");
              if (!result.ok) return result;
              setPaste("");
              return { ok: true, slides: result.data.item.slides || [], status: result.data.item.status, note: "Notes were converted into a draft." };
            })
          }
        >
          Convert paste
        </button>
        <label className="studio-upload" style={{ position: "relative", overflow: "hidden" }}>
          <span>{busy ? "Working…" : "Upload .pptx, .pdf, or .docx"}</span>
          <input
            type="file"
            accept=".pptx,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void run(async () => {
                const result = await importIntoLesson(lessonId, file, "", "append");
                if (!result.ok) return result;
                return { ok: true, slides: result.data.item.slides || [], status: result.data.item.status, note: `${file.name} was converted into a draft.` };
              });
            }}
          />
        </label>
      </div>
      <div className="studio-author-actions">
        {ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const result = await assistLesson(lessonId, action.id);
                if (!result.ok) return result;
                const note = result.data.degraded
                  ? `${action.label} drafted locally. Review it before submitting.`
                  : `${action.label} drafted. Review it before submitting.`;
                const extra = result.data.questions ? ` ${result.data.questions} question${result.data.questions === 1 ? "" : "s"} went to the question bank as drafts.` : "";
                return { ok: true, slides: result.data.item.slides || [], status: result.data.item.status, note: note + extra };
              })
            }
          >
            {action.label}
          </button>
        ))}
      </div>
      <div className="studio-author-actions">
        <label>
          Template
          <select
            defaultValue=""
            onChange={(event) => {
              const template = event.target.value;
              event.target.value = "";
              if (!template) return;
              void run(async () => {
                const result = await insertTemplate(lessonId, template);
                if (!result.ok) return result;
                return { ok: true, slides: result.data.item.slides || [], status: result.data.item.status, note: "Template slides were added as a draft." };
              });
            }}
          >
            <option value="">Insert a template…</option>
            {templates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reuse a game
          <select
            defaultValue=""
            onChange={(event) => {
              const gameId = event.target.value;
              event.target.value = "";
              if (!gameId) return;
              void run(async () => {
                const result = await reuseGame(lessonId, gameId);
                if (!result.ok) return result;
                return { ok: true, slides: result.data.item.slides || [], status: result.data.item.status, note: "The game was copied into this draft." };
              });
            }}
          >
            <option value="">{games.length ? "Add a saved game…" : "No saved games yet"}</option>
            {games.map((game) => (
              <option key={game.id} value={game.id}>
                {game.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const game = [...slides].reverse().flatMap((slide) => slide.blocks).find((block) => block.type === "game");
            if (!game || game.type !== "game" || !moduleId) {
              onError("Add a game block before saving it for reuse.");
              return;
            }
            void run(async () => {
              const result = await saveReusableGame(moduleId, game.title || "Game", game);
              if (!result.ok) return { ok: false, message: result.message };
              const refreshed = await loadGames(moduleId);
              if (refreshed.ok) setGames(refreshed.data);
              return { ok: true, slides, note: "Game saved. You can drop it into another lesson in this module." };
            });
          }}
        >
          Save game for reuse
        </button>
      </div>
      {targets.length ? (
        <div className="studio-author-actions">
          <label>
            Copy this lesson to
            <select value={copyModule} onChange={(event) => setCopyModule(event.target.value)}>
              <option value="">Choose a module in your scope</option>
              {targets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code}: {item.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !copyModule}
            onClick={() => {
              void run(async () => {
                const result = await copyLessonTo(lessonId, copyModule);
                if (!result.ok) return result;
                return {
                  ok: true,
                  slides,
                  note: `Copied as a draft. Open “${result.data.item.title}” from Lessons.`,
                };
              });
            }}
          >
            Copy lesson
          </button>
        </div>
      ) : null}
    </section>
  );
}
