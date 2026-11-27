"use client";

import { useEffect, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import {
  importPastPaper,
  importQuestionFile,
  loadBank,
  loadPastPapers,
  loadTopics,
  saveBankQuestion,
  type BankQuestion,
  type PastPaper,
} from "@/lib/authoring";
import { loadModules, moduleLabel, type AdminModule } from "@/lib/cms";

export default function AdminQuestionsPage() {
  const [modules, setModules] = useState<AdminModule[]>([]);
  const [moduleId, setModuleId] = useState("");
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [papers, setPapers] = useState<PastPaper[]>([]);
  const [topics, setTopics] = useState<{ id: string; title: string }[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [openId, setOpenId] = useState("");

  async function refresh(nextModule = moduleId) {
    if (!nextModule) return;
    const [bank, paperResult, topicResult] = await Promise.all([loadBank(nextModule), loadPastPapers(nextModule), loadTopics(nextModule)]);
    if (!bank.ok) {
      setError(bank.message);
      return;
    }
    setQuestions(bank.data);
    if (paperResult.ok) setPapers(paperResult.data);
    if (topicResult.ok) setTopics(topicResult.data);
  }

  useEffect(() => {
    loadModules().then((result) => {
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setModules(result.data);
      setModuleId(result.data[0]?.id || "");
    });
  }, []);

  useEffect(() => {
    if (moduleId) void refresh(moduleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId]);

  const open = questions.find((item) => item.id === openId);

  return (
    <AppShell variant="admin" title="Question Bank" subtitle="Past papers and imported questions stay in draft until you review them.">
      {error ? <p className="cms-error">{error}</p> : null}
      {message ? <p className="cms-ok">{message}</p> : null}
      <div className="cms-toolbar">
        <label>
          Module
          <select value={moduleId} onChange={(event) => setModuleId(event.target.value)}>
            {modules.map((item) => (
              <option key={item.id} value={item.id}>
                {moduleLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="studio-upload" style={{ position: "relative", overflow: "hidden" }}>
          <span>Import CSV or Excel</span>
          <input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file || !moduleId) return;
              const result = await importQuestionFile(moduleId, file);
              if (!result.ok) setError(result.message);
              else {
                setMessage(`${result.data.length} draft question${result.data.length === 1 ? "" : "s"} imported.`);
                void refresh();
              }
            }}
          />
        </label>
        <label className="studio-upload" style={{ position: "relative", overflow: "hidden" }}>
          <span>Upload past paper PDF</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file || !moduleId) return;
              const result = await importPastPaper(moduleId, file);
              if (!result.ok) setError(result.message);
              else {
                setMessage(`${result.data.paper.title} was split into ${result.data.items.length} draft questions. Add model answers before review.`);
                void refresh();
              }
            }}
          />
        </label>
      </div>
      <div className="cms-split">
        <article className="dash-card">
          <header className="dash-card-head">
            <h2>Questions</h2>
          </header>
          {questions.length ? (
            <ul className="cms-lessons">
              {questions.map((question) => (
                <li key={question.id}>
                  <button type="button" className={openId === question.id ? "is-active cms-plain" : "cms-plain"} onClick={() => setOpenId(question.id)}>
                    <strong>{question.paperLabel || question.title}</strong>
                    <span>
                      {question.status} · {question.kind} · {question.source}
                      {question.topicTitle ? ` · ${question.topicTitle}` : ""}
                      {question.warnings.length ? ` · ${question.warnings[0]}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dash-empty">No questions in this module yet. Import a spreadsheet or a past paper.</p>
          )}
          {papers.length ? (
            <>
              <h3>Past papers</h3>
              <ul className="cms-lessons">
                {papers.map((paper) => (
                  <li key={paper.id}>
                    <div>
                      <strong>{paper.title}</strong>
                      <span>
                        {paper.status} · {paper.questionCount} questions{paper.year ? ` · ${paper.year}` : ""}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </article>
        <article className="dash-card">
          <header className="dash-card-head">
            <h2>Model answer</h2>
          </header>
          {open ? (
            <QuestionEditor
              key={open.id}
              question={open}
              topics={topics}
              onSaved={async (note) => {
                setMessage(note);
                await refresh();
              }}
              onError={setError}
            />
          ) : (
            <p className="dash-empty">Choose a question to tag a topic and write the model answer. Saving keeps it as a draft.</p>
          )}
        </article>
      </div>
    </AppShell>
  );
}

function QuestionEditor({
  question,
  topics,
  onSaved,
  onError,
}: {
  question: BankQuestion;
  topics: { id: string; title: string }[];
  onSaved: (note: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [prompt, setPrompt] = useState(question.prompt);
  const [topic, setTopic] = useState(question.topicTitle);
  const [modelAnswer, setModelAnswer] = useState(question.modelAnswer);
  const [explanation, setExplanation] = useState(question.explanation);
  const [choices, setChoices] = useState(question.choices.map((choice) => choice.label));
  const correctStart = question.choices.findIndex((choice) => question.correctOptionIds.includes(choice.id));
  const [correctIndex, setCorrectIndex] = useState(correctStart >= 0 ? String(correctStart) : "");

  return (
    <form
      className="cms-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await saveBankQuestion(question.id, {
          prompt,
          kind: question.kind,
          topic,
          modelAnswer,
          explanation,
          choices: question.kind === "mcq" ? choices : undefined,
          correctIndex: correctIndex === "" ? null : Number(correctIndex),
          accepted: question.kind === "mcq" ? undefined : modelAnswer ? [modelAnswer] : [],
        });
        if (!result.ok) onError(result.message);
        else await onSaved("Saved as a draft. It is not published.");
      }}
    >
      <p>
        {question.status} · {question.kind}
        {question.warnings.length ? ` · ${question.warnings.join(" ")}` : ""}
      </p>
      <label>
        Prompt
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      </label>
      <label>
        Topic
        <input value={topic} list="bank-topics" onChange={(event) => setTopic(event.target.value)} placeholder="Tag a topic" />
        <datalist id="bank-topics">
          {topics.map((item) => (
            <option key={item.id} value={item.title} />
          ))}
        </datalist>
      </label>
      {question.kind === "mcq"
        ? choices.map((choice, index) => (
            <label key={`${question.id}-${index}`}>
              Option {index + 1}
              <input
                value={choice}
                onChange={(event) => setChoices(choices.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))}
              />
            </label>
          ))
        : null}
      {question.kind === "mcq" ? (
        <label>
          Correct option
          <select value={correctIndex} onChange={(event) => setCorrectIndex(event.target.value)}>
            <option value="">Not set yet</option>
            {choices.map((choice, index) => (
              <option key={`${question.id}-correct-${index}`} value={index}>
                {choice || `Option ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        Model answer
        <textarea value={modelAnswer} onChange={(event) => setModelAnswer(event.target.value)} />
      </label>
      <label>
        Explanation
        <textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} />
      </label>
      <button type="submit" className="dash-primary">
        Save draft
      </button>
    </form>
  );
}
