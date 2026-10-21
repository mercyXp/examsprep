"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createExamType,
  deleteAcademicPeriod,
  deleteModuleExamSlot,
  deleteProgramExamSchedule,
  loadAcademicSchedule,
  saveAcademicPeriod,
  saveModuleExamSlot,
  saveProgramExamSchedule,
  type AcademicPeriod,
  type AcademicSchedule,
  type ModuleExamRow,
  type ProgramExamRow,
} from "@/lib/cms";

type BusyKey = string | null;

const emptyPeriod: Omit<AcademicPeriod, "id"> = {
  name: "",
  academicYear: "2026/2027",
  semesterNumber: 2,
  windowStart: "2026-11-16",
  windowEnd: "2026-11-27",
  isCurrent: true,
  isPublished: false,
};

function applySchedule(
  result: Awaited<ReturnType<typeof loadAcademicSchedule>>,
  onError: (message: string) => void,
  onOk: (data: AcademicSchedule) => void,
) {
  if (!result.ok) {
    onError(result.message);
    return;
  }
  onOk(result.data);
}

export default function AcademicConfiguration({
  canManage,
  onError,
  onMessage,
}: {
  canManage: boolean;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
}) {
  const [schedule, setSchedule] = useState<AcademicSchedule | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState("current");
  const [periodDraft, setPeriodDraft] = useState(emptyPeriod);
  const [programDrafts, setProgramDrafts] = useState<Record<string, ProgramExamRow>>({});
  const [moduleDrafts, setModuleDrafts] = useState<Record<string, ModuleExamRow>>({});
  const [programFilter, setProgramFilter] = useState("all");
  const [examTypeId, setExamTypeId] = useState("");
  const [newTypeName, setNewTypeName] = useState("");
  const [busy, setBusy] = useState<BusyKey>(null);

  const creating = selectedPeriodId === "new";
  const periodId = creating ? "" : schedule?.period.id || "";

  function hydrate(data: AcademicSchedule) {
    setSchedule(data);
    setSelectedPeriodId(data.period.id);
    setPeriodDraft({
      name: data.period.name,
      academicYear: data.period.academicYear,
      semesterNumber: data.period.semesterNumber,
      windowStart: data.period.windowStart,
      windowEnd: data.period.windowEnd,
      isCurrent: data.period.isCurrent,
      isPublished: data.period.isPublished,
    });
    setExamTypeId(data.examType.id);
    setProgramDrafts(Object.fromEntries(data.programmes.map((item) => [item.id, item])));
    setModuleDrafts(Object.fromEntries(data.modules.map((item) => [item.id, item])));
  }

  useEffect(() => {
    loadAcademicSchedule().then((result) => applySchedule(result, onError, hydrate));
  }, [onError]);

  async function loadPeriod(id: string, typeId = examTypeId) {
    if (id === "new") {
      setSelectedPeriodId("new");
      setPeriodDraft(emptyPeriod);
      return;
    }
    setBusy("load");
    const result = await loadAcademicSchedule(id === "current" ? undefined : id, typeId || undefined);
    setBusy(null);
    applySchedule(result, onError, hydrate);
  }

  async function onAddExamType(event: FormEvent) {
    event.preventDefault();
    const name = newTypeName.trim();
    if (!name) return;
    setBusy("type");
    const result = await createExamType(name);
    setBusy(null);
    if (!result.ok) {
      onError(result.message);
      return;
    }
    setNewTypeName("");
    onMessage(`${result.data.item.name} added.`);
    if (creating) {
      setExamTypeId(result.data.item.id);
      setSchedule((current) =>
        current ? { ...current, examType: result.data.item, examTypes: result.data.items } : current,
      );
      return;
    }
    await loadPeriod(selectedPeriodId, result.data.item.id);
  }

  async function persistPeriod(published = periodDraft.isPublished) {
    setBusy("period");
    const result = await saveAcademicPeriod({ ...periodDraft, isPublished: published }, creating ? undefined : periodId);
    if (!result.ok) {
      setBusy(null);
      onError(result.message);
      return;
    }
    const typed = await loadAcademicSchedule(result.data.period.id, examTypeId || result.data.examType.id);
    setBusy(null);
    applySchedule(typed, onError, (data) => {
      hydrate(data);
      onMessage(published ? "Official calendar published." : creating ? "Draft period saved." : "Calendar updated.");
    });
  }

  async function onDeletePeriod() {
    if (!periodId) return;
    setBusy("delete-period");
    const result = await deleteAcademicPeriod(periodId);
    setBusy(null);
    applySchedule(result, onError, (data) => {
      hydrate(data);
      onMessage("Period removed.");
    });
  }

  async function onSaveProgram(row: ProgramExamRow) {
    if (!periodId || !row.startDate || !row.endDate) {
      onError("Enter the program start and end dates.");
      return;
    }
    setBusy(`program-${row.id}`);
    const result = await saveProgramExamSchedule(periodId, row.id, {
      startDate: row.startDate,
      endDate: row.endDate,
      adminsCanEdit: row.adminsCanEdit,
      examTypeId,
    });
    setBusy(null);
    applySchedule(result, onError, (data) => {
      hydrate(data);
      onMessage(`${row.name} saved.`);
    });
  }

  async function onClearProgram(row: ProgramExamRow) {
    if (!periodId) return;
    setBusy(`program-${row.id}`);
    const result = await deleteProgramExamSchedule(periodId, row.id, examTypeId);
    setBusy(null);
    applySchedule(result, onError, (data) => {
      hydrate(data);
      onMessage(`${row.name} cleared.`);
    });
  }

  async function onSaveModule(row: ModuleExamRow) {
    if (!periodId || !row.examDate) {
      onError("Enter the module examination date.");
      return;
    }
    setBusy(`module-${row.id}`);
    const result = await saveModuleExamSlot(periodId, row.id, {
      examDate: row.examDate,
      examTime: row.examTime,
      examTypeId,
    });
    setBusy(null);
    applySchedule(result, onError, (data) => {
      hydrate(data);
      onMessage(`${row.code} saved.`);
    });
  }

  async function onClearModule(row: ModuleExamRow) {
    if (!periodId) return;
    setBusy(`module-${row.id}`);
    const result = await deleteModuleExamSlot(periodId, row.id, examTypeId);
    setBusy(null);
    applySchedule(result, onError, (data) => {
      hydrate(data);
      onMessage(`${row.code} cleared.`);
    });
  }

  const modules = useMemo(() => {
    const rows = Object.values(moduleDrafts);
    if (programFilter === "all") return rows;
    return rows.filter((item) => item.programmeId === programFilter);
  }, [moduleDrafts, programFilter]);

  const warnings = schedule?.warnings ?? [];
  const statusLabel = creating ? "Draft" : periodDraft.isPublished ? "Published" : "Draft";

  return (
    <section className="settings-panel settings-academic">
      <header className="settings-academic-head">
        <div>
          <h2>Academic Configuration</h2>
          <p>Official examination calendar.</p>
        </div>
        <div className="settings-block-head">
          <select
            value={examTypeId}
            onChange={(event) => {
              const next = event.target.value;
              setExamTypeId(next);
              if (!creating) void loadPeriod(selectedPeriodId, next);
            }}
            disabled={busy === "load"}
            aria-label="Examination type"
          >
            {(schedule?.examTypes ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          {canManage ? (
            <form className="settings-type-add" onSubmit={onAddExamType}>
              <input
                value={newTypeName}
                onChange={(event) => setNewTypeName(event.target.value)}
                placeholder="Add type"
                aria-label="New examination type"
              />
              <button type="submit" className="dash-secondary" disabled={busy === "type" || !newTypeName.trim()}>
                Add
              </button>
            </form>
          ) : null}
          <span role="status" className={`settings-chip${periodDraft.isPublished && !creating ? "" : " is-muted"}`}>
            {statusLabel}
          </span>
        </div>
      </header>

      {warnings.length ? (
        <ul className="settings-warnings">
          {warnings.map((item) => (
            <li key={`${item.code}-${item.message}`} className={item.level === "error" ? "is-error" : "is-warn"}>
              {item.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="settings-block">
        <div className="settings-block-head">
          <h3>Period</h3>
          <select value={selectedPeriodId} onChange={(event) => loadPeriod(event.target.value)} disabled={busy === "load"}>
            {schedule?.periods.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.isCurrent ? " · current" : ""}
                {item.isPublished ? "" : " · draft"}
              </option>
            ))}
            {canManage ? <option value="new">New period</option> : null}
          </select>
        </div>
        <form
          className="settings-period"
          onSubmit={(event) => {
            event.preventDefault();
            persistPeriod(periodDraft.isPublished);
          }}
        >
          <div className="settings-fields is-calendar">
            <label>
              Name
              <input
                value={periodDraft.name}
                onChange={(event) => setPeriodDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="November 2026 examinations"
                required
                disabled={!canManage}
              />
            </label>
            <label>
              Year
              <input
                value={periodDraft.academicYear}
                onChange={(event) => setPeriodDraft((current) => ({ ...current, academicYear: event.target.value }))}
                placeholder="2026/2027"
                required
                list="academic-years"
                disabled={!canManage}
              />
              <datalist id="academic-years">
                <option value="2025/2026" />
                <option value="2026/2027" />
                <option value="2027/2028" />
              </datalist>
            </label>
            <label>
              Semester
              <select
                value={periodDraft.semesterNumber}
                onChange={(event) => setPeriodDraft((current) => ({ ...current, semesterNumber: Number(event.target.value) }))}
                disabled={!canManage}
              >
                <option value={1}>Semester 1</option>
                <option value={2}>Semester 2</option>
              </select>
            </label>
            <label>
              Window start
              <input
                type="date"
                value={periodDraft.windowStart}
                onChange={(event) => setPeriodDraft((current) => ({ ...current, windowStart: event.target.value }))}
                required
                disabled={!canManage}
              />
            </label>
            <label>
              Window end
              <input
                type="date"
                value={periodDraft.windowEnd}
                onChange={(event) => setPeriodDraft((current) => ({ ...current, windowEnd: event.target.value }))}
                required
                disabled={!canManage}
              />
            </label>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={periodDraft.isCurrent}
                onChange={(event) => setPeriodDraft((current) => ({ ...current, isCurrent: event.target.checked }))}
                disabled={!canManage}
              />
              Current
            </label>
          </div>
          {canManage ? (
            <div className="settings-actions">
              <button type="submit" className="dash-primary" disabled={busy === "period"}>
                {busy === "period" ? "Saving…" : creating ? "Save draft" : "Save"}
              </button>
              <button
                type="button"
                className="dash-secondary"
                disabled={busy === "period"}
                onClick={() => persistPeriod(!periodDraft.isPublished)}
              >
                {periodDraft.isPublished ? "Unpublish" : "Publish"}
              </button>
              {!creating && (schedule?.periods.length || 0) > 1 ? (
                <button type="button" className="dash-secondary" onClick={onDeletePeriod} disabled={busy === "delete-period"}>
                  Remove
                </button>
              ) : null}
            </div>
          ) : null}
        </form>
      </div>

      {creating ? (
        <p className="settings-note">Save the period first.</p>
      ) : (
        <>
          <p className="settings-note">
            Dates below are for {schedule?.examType.name || "this examination type"}. Leave a type empty until the
            university publishes it.
          </p>
          <div className="settings-block">
            <h3>Programs</h3>
            <div className="settings-table-wrap">
              <table className="settings-table">
                <thead>
                  <tr>
                    <th>Program</th>
                    <th>Start</th>
                    <th>End</th>
                    {canManage ? <th>Edit</th> : null}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {Object.values(programDrafts).map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.name}</strong>
                        <span className={`settings-chip${row.scheduled ? "" : " is-muted"}`}>{row.scheduled ? "Set" : "—"}</span>
                      </td>
                      <td>
                        <input
                          type="date"
                          value={row.startDate || ""}
                          disabled={!row.canEdit && !canManage}
                          onChange={(event) =>
                            setProgramDrafts((current) => ({
                              ...current,
                              [row.id]: { ...row, startDate: event.target.value },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          value={row.endDate || ""}
                          disabled={!row.canEdit && !canManage}
                          onChange={(event) =>
                            setProgramDrafts((current) => ({
                              ...current,
                              [row.id]: { ...row, endDate: event.target.value },
                            }))
                          }
                        />
                      </td>
                      {canManage ? (
                        <td>
                          <input
                            type="checkbox"
                            checked={row.adminsCanEdit}
                            onChange={(event) =>
                              setProgramDrafts((current) => ({
                                ...current,
                                [row.id]: { ...row, adminsCanEdit: event.target.checked },
                              }))
                            }
                            aria-label={`Allow program administrators to edit ${row.name}`}
                          />
                        </td>
                      ) : null}
                      <td>
                        {row.canEdit || canManage ? (
                          <div className="settings-row-actions">
                            <button
                              type="button"
                              className="dash-primary"
                              disabled={busy === `program-${row.id}`}
                              onClick={() => onSaveProgram(programDrafts[row.id])}
                            >
                              Save
                            </button>
                            {row.scheduled ? (
                              <button
                                type="button"
                                className="dash-secondary"
                                disabled={busy === `program-${row.id}`}
                                onClick={() => onClearProgram(row)}
                              >
                                Clear
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <span className="settings-note">View only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="settings-block">
            <div className="settings-block-head">
              <h3>Modules</h3>
              <select value={programFilter} onChange={(event) => setProgramFilter(event.target.value)}>
                <option value="all">All programs</option>
                {Object.values(programDrafts).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="settings-table-wrap">
              <table className="settings-table">
                <thead>
                  <tr>
                    <th>Module</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {modules.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>
                          {row.code} — {row.name}
                        </strong>
                        <span className={`settings-chip${row.scheduled ? "" : " is-muted"}`}>{row.scheduled ? "Date" : "Week"}</span>
                      </td>
                      <td>
                        <input
                          type="date"
                          value={row.examDate || ""}
                          disabled={!row.canEdit && !canManage}
                          onChange={(event) =>
                            setModuleDrafts((current) => ({
                              ...current,
                              [row.id]: { ...row, examDate: event.target.value },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="time"
                          value={row.examTime || ""}
                          disabled={!row.canEdit && !canManage}
                          onChange={(event) =>
                            setModuleDrafts((current) => ({
                              ...current,
                              [row.id]: { ...row, examTime: event.target.value || null },
                            }))
                          }
                        />
                      </td>
                      <td>
                        {row.canEdit || canManage ? (
                          <div className="settings-row-actions">
                            <button
                              type="button"
                              className="dash-primary"
                              disabled={busy === `module-${row.id}`}
                              onClick={() => onSaveModule(moduleDrafts[row.id])}
                            >
                              Save
                            </button>
                            {row.scheduled ? (
                              <button
                                type="button"
                                className="dash-secondary"
                                disabled={busy === `module-${row.id}`}
                                onClick={() => onClearModule(row)}
                              >
                                Clear
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <span className="settings-note">View only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
