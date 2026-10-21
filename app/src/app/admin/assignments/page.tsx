"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import {
  assignCreator,
  assignProgramAdmin,
  loadAssignments,
  loadScope,
  revokeCreator,
  revokeProgramAdmin,
  type AdminScope,
  type CreatorAssignmentRow,
  type ProgramAdminRow,
} from "@/lib/cms";

type Person = { id: string; name: string; email: string; roles: string[] };
type AssignRole = "creator" | "administrator";
type TableRow = {
  id: string;
  kind: AssignRole;
  userId: string;
  name: string;
  email: string;
  programmeId: string | null;
  programmeName: string;
  moduleId: string | null;
  moduleCode: string;
  moduleName: string;
};

const PAGE_SIZE = 8;
const AVATAR_TONES = ["violet", "teal", "orange", "pink", "blue"] as const;

function initials(name: string, email: string) {
  const source = name.trim() || email;
  const parts = source.split(/[\s@]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "C") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function avatarTone(key: string) {
  let total = 0;
  for (const char of key) total += char.charCodeAt(0);
  return AVATAR_TONES[total % AVATAR_TONES.length];
}

function PeopleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 19a5 5 0 0 1 10 0M16 11a3 3 0 1 0 0-6M20 19a4.5 4.5 0 0 0-4-4.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3 5 6v6c0 4.2 2.9 7.4 7 8.5 4.1-1.1 7-4.3 7-8.5V6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21.5z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 10h16l-8-6zM6 10v8M12 10v8M18 10v8M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export default function AssignmentsPage() {
  const [scope, setScope] = useState<AdminScope | null>(null);
  const [admins, setAdmins] = useState<ProgramAdminRow[]>([]);
  const [creators, setCreators] = useState<CreatorAssignmentRow[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [userId, setUserId] = useState("");
  const [assignRole, setAssignRole] = useState<AssignRole>("creator");
  const [programmeId, setProgrammeId] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [filterProgrammeId, setFilterProgrammeId] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function applyLoaded(
    scopeResult: Awaited<ReturnType<typeof loadScope>>,
    assignmentResult: Awaited<ReturnType<typeof loadAssignments>>,
  ) {
    if (!scopeResult.ok) {
      setError(scopeResult.message);
      return;
    }
    setScope(scopeResult.data);
    const programmes = scopeResult.data.programmes ?? [];
    const withModules = programmes.find((item) =>
      (scopeResult.data.modules ?? []).some((module) => module.programmeId === item.id),
    );
    const defaultProgramme = withModules?.id ?? programmes[0]?.id ?? "";
    if (defaultProgramme) {
      setProgrammeId((current) => current || defaultProgramme);
      setFilterProgrammeId((current) => current || (scopeResult.data.canAssignAdmins ? "" : defaultProgramme));
    }
    if (!assignmentResult.ok) {
      setError(assignmentResult.message);
      return;
    }
    setError("");
    setAdmins(assignmentResult.data.programAdmins ?? []);
    setCreators(assignmentResult.data.creators ?? []);
    setPeople(assignmentResult.data.people ?? []);
  }

  async function refresh() {
    applyLoaded(...(await Promise.all([loadScope(), loadAssignments()])));
  }

  useEffect(() => {
    Promise.all([loadScope(), loadAssignments()]).then(([scopeResult, assignmentResult]) => {
      applyLoaded(scopeResult, assignmentResult);
    });
  }, []);

  const isSuper = Boolean(scope?.canAssignAdmins);
  const programmes = scope?.programmes ?? [];
  const creatorModules = useMemo(
    () => (scope?.modules ?? []).filter((item) => !programmeId || item.programmeId === programmeId),
    [scope, programmeId],
  );
  const formPeople = useMemo(() => {
    if (isSuper) return people;
    const creatorsOnly = people.filter((person) => person.roles.includes("creator"));
    return creatorsOnly.length ? creatorsOnly : people;
  }, [isSuper, people]);

  const tableRows = useMemo<TableRow[]>(() => {
    const creatorRows: TableRow[] = creators.map((row) => ({
      id: `creator-${row.id}`,
      kind: "creator",
      userId: row.userId,
      name: row.name,
      email: row.email,
      programmeId: row.programmeId,
      programmeName: row.programmeName,
      moduleId: row.moduleId,
      moduleCode: row.moduleCode,
      moduleName: row.moduleName,
    }));
    if (!isSuper) return creatorRows;
    return [
      ...admins.map((row) => ({
        id: `admin-${row.id}`,
        kind: "administrator" as const,
        userId: row.userId,
        name: row.name,
        email: row.email,
        programmeId: row.programmeId,
        programmeName: row.programmeName,
        moduleId: null,
        moduleCode: "",
        moduleName: "All modules",
      })),
      ...creatorRows,
    ];
  }, [admins, creators, isSuper]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tableRows.filter((row) => {
      if (filterProgrammeId && row.programmeId !== filterProgrammeId) return false;
      if (roleFilter && row.kind !== roleFilter) return false;
      if (!needle) return true;
      return [row.name, row.email, row.programmeName, row.moduleCode, row.moduleName].some((value) =>
        value.toLowerCase().includes(needle),
      );
    });
  }, [tableRows, filterProgrammeId, roleFilter, query]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = visibleRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const from = visibleRows.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(currentPage * PAGE_SIZE, visibleRows.length);

  const uniqueCreators = new Set(creators.map((row) => row.userId)).size;
  const uniqueAdmins = new Set(admins.map((row) => row.userId)).size;
  const totalAssignments = creators.length + (isSuper ? admins.length : 0);
  const activeProgramme = programmes.find((item) => item.id === (filterProgrammeId || programmeId));

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!userId || !programmeId) {
      setError("Choose a user and a program.");
      return;
    }
    if (assignRole === "creator") {
      if (!moduleId) {
        setError("Choose a module for a content creator.");
        return;
      }
      const result = await assignCreator(userId, programmeId, moduleId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessage("Content creator assignment saved.");
    } else {
      const result = await assignProgramAdmin(userId, programmeId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessage("Program administrator assigned.");
    }
    setUserId("");
    setModuleId("");
    setMenuId(null);
    refresh();
  }

  async function removeRow(row: TableRow) {
    const id = row.id.split("-").slice(1).join("-");
    const result = row.kind === "creator" ? await revokeCreator(id) : await revokeProgramAdmin(id);
    setMenuId(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage(
      row.kind === "creator"
        ? "Creator assignment removed. Existing content was kept."
        : "Program administrator assignment removed. Existing content was kept.",
    );
    refresh();
  }

  const programCard = !isSuper && scope ? (
    <div className="assign-context">
      <span className="assign-context-icon" aria-hidden="true">
        <BuildingIcon />
      </span>
      <div>
        <strong>Program Administrator</strong>
        {programmes.length > 1 ? (
          <label className="assign-context-select">
            <span className="sr-only">Assigned program</span>
            <select
              value={filterProgrammeId}
              onChange={(event) => {
                const next = event.target.value;
                setFilterProgrammeId(next);
                setPage(1);
                if (next) setProgrammeId(next);
              }}
            >
              {programmes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span>{activeProgramme?.name || programmes[0]?.name || "No assigned program"}</span>
        )}
        <em>Assigned programs ({programmes.length})</em>
      </div>
    </div>
  ) : null;

  const superKpis = isSuper ? (
    <section className="assign-kpis" aria-label="Assignment totals">
      <article className="assign-kpi">
        <span className="assign-kpi-icon is-creators">
          <PeopleIcon />
        </span>
        <div>
          <strong>{uniqueCreators}</strong>
          <p>Content Creators</p>
          <span>with module access</span>
        </div>
      </article>
      <article className="assign-kpi">
        <span className="assign-kpi-icon is-admins">
          <ShieldIcon />
        </span>
        <div>
          <strong>{uniqueAdmins}</strong>
          <p>Program Administrators</p>
          <span>across programs</span>
        </div>
      </article>
      <article className="assign-kpi">
        <span className="assign-kpi-icon is-modules">
          <BookIcon />
        </span>
        <div>
          <strong>{totalAssignments}</strong>
          <p>Module Assignments</p>
          <span>total active assignments</span>
        </div>
      </article>
    </section>
  ) : null;

  return (
    <AppShell
      variant="admin"
      title="Assignments"
      subtitle={
        isSuper
          ? "Manage program and module access for content creators and administrators."
          : "Manage content creators for your assigned programs and modules."
      }
      actions={isSuper ? superKpis : programCard}
    >
      <div className="dash-body assign-page">
        {error ? <p className="cms-error">{error}</p> : null}
        {message ? <p className="cms-ok">{message}</p> : null}

        {isSuper ? null : (
          <section className="assign-stats" aria-label="Assignment totals">
            <article className="assign-stat is-creators">
              <span className="assign-stat-icon">
                <PeopleIcon />
              </span>
              <div>
                <p>Content Creators</p>
                <strong>{uniqueCreators}</strong>
                <span>In your assigned programs</span>
              </div>
            </article>
            <article className="assign-stat is-modules">
              <span className="assign-stat-icon">
                <BookIcon />
              </span>
              <div>
                <p>Module Assignments</p>
                <strong>{creators.length}</strong>
                <span>Across your programs</span>
              </div>
            </article>
          </section>
        )}

        {isSuper ? (
          <section className="assign-guide">
            <div className="assign-guide-intro">
              <span className="assign-kpi-icon is-creators">
                <PeopleIcon />
              </span>
              <div>
                <h2>Assign Access</h2>
                <p>Give users access to programs and modules based on their role.</p>
              </div>
            </div>
            <ol>
              <li>
                <b>1</b>
                <div>
                  <strong>Select a user</strong>
                  <span>Choose a content creator or program administrator</span>
                </div>
              </li>
              <li>
                <b>2</b>
                <div>
                  <strong>Choose program(s)</strong>
                  <span>Assign to one or more programs of study</span>
                </div>
              </li>
              <li>
                <b>3</b>
                <div>
                  <strong>Choose module(s)</strong>
                  <span>Grant access to specific modules (for creators) or all modules (for program admin)</span>
                </div>
              </li>
            </ol>
          </section>
        ) : null}

        {scope?.canAssignCreators || isSuper ? (
          <form className="assign-panel" onSubmit={onCreate}>
            <header>
              <h2>{isSuper ? "Create Assignment" : "Assign a content creator"}</h2>
              <p>
                {isSuper
                  ? "Select a user and define their access scope."
                  : "Give a content creator access to specific modules within your assigned program(s)."}
              </p>
            </header>
            <div className={`assign-fields${isSuper ? " is-super" : ""}`}>
              <label>
                {isSuper ? "User" : "Content Creator"} {isSuper ? <i>*</i> : null}
                <select value={userId} onChange={(event) => setUserId(event.target.value)} required>
                  <option value="">{isSuper ? "Select a user" : "Select a content creator"}</option>
                  {formPeople.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
              {isSuper ? (
                <label>
                  Role
                  <select
                    value={assignRole}
                    onChange={(event) => {
                      setAssignRole(event.target.value as AssignRole);
                      setModuleId("");
                    }}
                  >
                    <option value="creator">Content Creator</option>
                    <option value="administrator">Program Administrator</option>
                  </select>
                </label>
              ) : null}
              <label>
                {isSuper ? "Program(s)" : "Program"}
                <select
                  value={programmeId}
                  onChange={(event) => {
                    setProgrammeId(event.target.value);
                    setModuleId("");
                  }}
                  required
                >
                  <option value="">{isSuper ? "Select program(s)" : "Select a program"}</option>
                  {programmes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {isSuper ? "Module(s)" : "Module"} {assignRole === "creator" ? <i>*</i> : null}
                <select
                  value={assignRole === "administrator" ? "" : moduleId}
                  onChange={(event) => setModuleId(event.target.value)}
                  disabled={assignRole === "administrator"}
                  required={assignRole === "creator"}
                >
                  <option value="">{assignRole === "administrator" ? "All modules" : "Select module(s)"}</option>
                  {creatorModules.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="assign-submit">
                + Assign
              </button>
            </div>
          </form>
        ) : null}

        <article className="assign-panel">
          <header className="assign-table-head">
            <div>
              <h2>Current Assignments</h2>
              <p>{isSuper ? "Manage existing user assignments and their access scope." : "Manage your content creators and their module access."}</p>
            </div>
            <div className="assign-table-tools">
              <label className="assign-search">
                <span className="sr-only">Search by name, program or module</span>
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search by name, program or module…"
                />
              </label>
              {isSuper ? (
                <label>
                  <span className="sr-only">Filter by role</span>
                  <select
                    value={roleFilter}
                    onChange={(event) => {
                      setRoleFilter(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All roles</option>
                    <option value="creator">Content Creator</option>
                    <option value="administrator">Program Administrator</option>
                  </select>
                </label>
              ) : null}
            </div>
          </header>
          <div className="assign-table-wrap">
            <table className="assign-table">
              <thead>
                <tr>
                  <th>User</th>
                  {isSuper ? <th>Role</th> : null}
                  <th>Program{isSuper ? "s" : ""}</th>
                  <th>Module{isSuper ? "s" : "(s)"}</th>
                  <th>Access</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <PersonCell row={row} />
                    </td>
                    {isSuper ? (
                      <td>
                        <span className={`assign-role is-${row.kind}`}>
                          {row.kind === "creator" ? "Content Creator" : "Program Administrator"}
                        </span>
                      </td>
                    ) : null}
                    <td>
                      <span className="assign-program">
                        <BuildingIcon />
                        {row.programmeName}
                      </span>
                    </td>
                    <td>
                      <strong>{row.moduleName}</strong>
                      {row.moduleCode ? <span className="cms-muted">{row.moduleCode}</span> : null}
                    </td>
                    <td>
                      <AccessCell row={row} />
                    </td>
                    <td>
                      <RowActions row={row} open={menuId === row.id} onToggle={() => setMenuId((current) => (current === row.id ? null : row.id))} onRemove={() => removeRow(row)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="assign-cards">
            {pageRows.map((row) => (
              <li key={`card-${row.id}`}>
                <PersonCell row={row} />
                {isSuper ? (
                  <span className={`assign-role is-${row.kind}`}>
                    {row.kind === "creator" ? "Content Creator" : "Program Administrator"}
                  </span>
                ) : null}
                <p>
                  <BuildingIcon /> {row.programmeName}
                </p>
                <p>
                  {row.moduleName}
                  {row.moduleCode ? ` · ${row.moduleCode}` : ""}
                </p>
                <AccessCell row={row} />
                <button type="button" className="assign-remove" onClick={() => removeRow(row)}>
                  Remove access
                </button>
              </li>
            ))}
          </ul>
          {!visibleRows.length ? <p className="dash-empty">No assignments in this view yet.</p> : null}
          <footer className="assign-pager">
            <span>
              Showing {from}–{to} of {visibleRows.length} assignments
            </span>
            <div>
              <button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => value - 1)} aria-label="Previous page">
                ‹
              </button>
              <b>{currentPage}</b>
              <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((value) => value + 1)} aria-label="Next page">
                ›
              </button>
            </div>
          </footer>
        </article>
        {scope && !scope.canAssignCreators && !scope.canAssignAdmins ? (
          <p className="dash-empty">
            You cannot manage assignments. <Link href="/admin">Back to dashboard</Link>
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}

function PersonCell({ row }: { row: TableRow }) {
  return (
    <div className="assign-person">
      <span className={`assign-avatar is-${avatarTone(row.userId)}`} aria-hidden="true">
        {initials(row.name, row.email)}
      </span>
      <span>
        <strong>{row.name}</strong>
        <em>{row.email}</em>
      </span>
    </div>
  );
}

function AccessCell({ row }: { row: TableRow }) {
  return (
    <span className={`assign-chip${row.kind === "administrator" ? " is-program" : ""}`}>
      {row.kind === "administrator" ? "Program access" : "Module access"}
    </span>
  );
}

function RowActions({
  row,
  open,
  onToggle,
  onRemove,
}: {
  row: TableRow;
  open: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="assign-actions">
      <button type="button" className="assign-kebab" aria-haspopup="menu" aria-expanded={open} aria-label={`Actions for ${row.name}`} onClick={onToggle}>
        ···
      </button>
      {open ? (
        <div className="assign-menu" role="menu">
          <button type="button" role="menuitem" onClick={onRemove}>
            Remove access
          </button>
        </div>
      ) : null}
    </div>
  );
}
