"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { loadScope, type AdminScope } from "@/lib/cms";
import {
  changeStaffRole,
  inviteStaff,
  loadStaff,
  resendStaffInvite,
  revokeStaffInvite,
  setStaffAccess,
  type StaffDirectory,
  type StaffInvitation,
} from "@/lib/staff";

const ACTION_LABELS: Record<string, string> = {
  "staff.invite": "Invitation sent",
  "staff.invite.resend": "Invitation resent",
  "staff.invite.revoke": "Invitation revoked",
  "staff.invite.accept": "Account activated",
  "staff.role.change": "Role changed",
  "staff.access.revoke": "Access revoked",
  "staff.access.restore": "Access restored",
};

function stamp(iso: string | null) {
  if (!iso) return "";
  const [day, time] = iso.split("T");
  return `${day} ${(time ?? "").slice(0, 5)}`.trim();
}

function statusClass(status: string) {
  if (status === "active" || status === "accepted") return "is-active";
  if (status === "pending") return "is-pending";
  return "is-suspended";
}

export default function StaffPanel() {
  const [scope, setScope] = useState<AdminScope | null>(null);
  const [data, setData] = useState<StaffDirectory | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("creator");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const result = await loadStaff();
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setData(result.data);
  }, []);

  useEffect(() => {
    void loadScope().then((result) => {
      if (result.ok) setScope(result.data);
    });
    void loadStaff().then((result) => {
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setData(result.data);
    });
  }, []);

  const superAdmin = Boolean(scope?.role === "super_administrator" || scope?.roles?.includes("super_administrator"));

  function showIssued(emailed: boolean, acceptUrl: string | null) {
    setLink(acceptUrl ?? "");
    setNotice(
      emailed
        ? "Invitation email sent."
        : "The invitation was saved, but the email was not sent. Copy the link below.",
    );
  }

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const result = await inviteStaff(email.trim(), role);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setEmail("");
    showIssued(result.data.emailed, result.data.acceptUrl);
    await refresh();
  }

  async function onResend(row: StaffInvitation) {
    setError("");
    const result = await resendStaffInvite(row.id);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    showIssued(result.data.emailed, result.data.acceptUrl);
    await refresh();
  }

  async function onRevoke(row: StaffInvitation) {
    setError("");
    setLink("");
    const result = await revokeStaffInvite(row.id);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNotice(`Invitation for ${row.email} revoked.`);
    await refresh();
  }

  async function onRole(userId: string, next: string) {
    setError("");
    const result = await changeStaffRole(userId, next);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    await refresh();
  }

  async function onAccess(userId: string, active: boolean) {
    setError("");
    const result = await setStaffAccess(userId, active);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    await refresh();
  }

  return (
    <>
      {scope && !superAdmin ? (
        <p className="admin-note">Only a super administrator can invite and manage staff.</p>
      ) : (
        <div className="admin-staff">
          <section className="admin-panel admin-create">
            <h2>Invite staff</h2>
            <p>The invitation is single-use and expires in 24 hours. The role is stored on the server.</p>
            <form onSubmit={onInvite} className="admin-staff-form">
              <label>
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@university.edu"
                />
              </label>
              <label>
                Role
                <select value={role} onChange={(event) => setRole(event.target.value)}>
                  <option value="creator">Creator</option>
                  <option value="administrator">Administrator</option>
                </select>
              </label>
              <button className="admin-create-btn" type="submit" disabled={busy}>
                {busy ? "Sending…" : "Invite staff"}
              </button>
            </form>
            {error ? <p className="cms-error">{error}</p> : null}
            {notice ? <p className="admin-note">{notice}</p> : null}
            {link ? (
              <p className="admin-staff-link">
                <a href={link}>{link}</a>
              </p>
            ) : null}
          </section>

          <section className="admin-panel">
            <h2>Staff directory</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Access</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.people ?? []).map((person) => {
                    const current = person.roles.includes("administrator") ? "administrator" : "creator";
                    return (
                      <tr key={person.id}>
                        <td>{person.name}</td>
                        <td>{person.email}</td>
                        <td>
                          <select
                            aria-label={`Role for ${person.email}`}
                            value={current}
                            onChange={(event) => void onRole(person.id, event.target.value)}
                          >
                            <option value="creator">Creator</option>
                            <option value="administrator">Administrator</option>
                          </select>
                        </td>
                        <td>
                          <span className={`admin-status ${statusClass(person.status)}`}>
                            {person.status === "active" ? "Active" : "Suspended"}
                          </span>
                        </td>
                        <td>
                          <button type="button" className="admin-text-btn" onClick={() => void onAccess(person.id, person.status !== "active")}>
                            {person.status === "active" ? "Revoke access" : "Restore access"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {data && data.people.length === 0 ? (
                    <tr>
                      <td colSpan={5}>No active staff accounts yet. Invitations appear below until they are accepted.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-panel">
            <h2>Invitations</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Expires</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.invitations ?? []).map((row) => (
                    <tr key={row.id}>
                      <td>{row.email}</td>
                      <td>{row.roleLabel}</td>
                      <td>
                        <span className={`admin-status ${statusClass(row.status)}`}>{row.status}</span>
                      </td>
                      <td>{stamp(row.expiresAt)}</td>
                      <td>
                        {row.status !== "accepted" ? (
                          <>
                            <button type="button" className="admin-text-btn" onClick={() => void onResend(row)}>
                              Resend
                            </button>
                            {row.status === "pending" ? (
                              <button type="button" className="admin-text-btn" onClick={() => void onRevoke(row)}>
                                Revoke
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <span>{stamp(row.acceptedAt)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data && data.invitations.length === 0 ? (
                    <tr>
                      <td colSpan={5}>No invitations yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-panel">
            <h2>Account history</h2>
            <ul className="admin-staff-history">
              {(data?.history ?? []).map((entry) => (
                <li key={entry.id}>
                  <strong>{ACTION_LABELS[entry.action] ?? entry.action}</strong>
                  <span>
                    {[entry.email, entry.role, entry.actor, entry.at ? stamp(entry.at) : ""].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
              {data && data.history.length === 0 ? <li>No staff actions yet.</li> : null}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
