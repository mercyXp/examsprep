"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/app/components/shell/AppShell";
import {
  changePassword,
  getSessionUser,
  signOut,
  updateProfile,
  type SessionUser,
} from "@/lib/auth";
import { loadScope, type AdminScope } from "@/lib/cms";
import AcademicConfiguration from "./AcademicConfiguration";

function roleLabel(roles: string[]) {
  if (roles.includes("super_administrator")) return "Super administrator";
  if (roles.includes("administrator")) return "Program administrator";
  if (roles.includes("creator")) return "Content creator";
  return roles.join(", ") || "Staff";
}

export default function AdminSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [scope, setScope] = useState<AdminScope | null>(null);
  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"profile" | "password" | "signout" | null>(null);

  const canViewAcademic = Boolean(scope?.canViewAcademic || scope?.canAssignAdmins);
  const canManageAcademic = Boolean(scope?.canManageAcademic || scope?.canAssignAdmins);

  useEffect(() => {
    Promise.all([getSessionUser(), loadScope()]).then(([session, scopeResult]) => {
      if (session) {
        setUser(session);
        setName(session.name);
      }
      if (scopeResult.ok) setScope(scopeResult.data);
    });
  }, []);

  const onAcademicError = useCallback((value: string) => {
    setMessage("");
    setError(value);
  }, []);
  const onAcademicMessage = useCallback((value: string) => {
    setError("");
    setMessage(value);
  }, []);

  async function onSaveProfile(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy("profile");
    const result = await updateProfile(name);
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setUser(result.user);
    setMessage("Profile saved.");
  }

  async function onChangePassword(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    setBusy("password");
    const result = await changePassword(currentPassword, newPassword);
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setMessage("Password updated. Other signed-in sessions were signed out.");
  }

  async function onSignOut() {
    setBusy("signout");
    await signOut();
    router.replace("/login");
  }

  return (
    <AppShell
      variant="admin"
      title="Settings"
      subtitle={
        canViewAcademic ? "Profile, security, and the official examination calendar." : "Profile and security."
      }
    >
      <div className={`dash-body settings-page${canViewAcademic ? " is-academic" : ""}`}>
        {error ? <p className="cms-error">{error}</p> : null}
        {message ? <p className="cms-ok">{message}</p> : null}

        <form className="settings-panel" onSubmit={onSaveProfile}>
          <header>
            <h2>My Profile</h2>
            <p>Manage personal information.</p>
          </header>
          <div className="settings-fields">
            <label>
              Full name
              <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
            </label>
            <label>
              Email
              <input value={user?.email || ""} readOnly />
            </label>
            <label>
              Role
              <input value={user ? roleLabel(user.roles) : ""} readOnly />
            </label>
          </div>
          <button type="submit" className="dash-primary" disabled={busy === "profile"}>
            {busy === "profile" ? "Saving…" : "Save profile"}
          </button>
        </form>

        <form className="settings-panel" onSubmit={onChangePassword}>
          <header>
            <h2>Account & Security</h2>
            <p>Password and session management.</p>
          </header>
          <div className="settings-session">
            <strong>This device</strong>
            <span>You are signed in on this browser. Changing your password signs out other sessions.</span>
          </div>
          <div className="settings-fields">
            <label>
              Current password
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </label>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>
          </div>
          <div className="settings-actions">
            <button type="submit" className="dash-primary" disabled={busy === "password"}>
              {busy === "password" ? "Updating…" : "Update password"}
            </button>
            <button type="button" className="dash-secondary" onClick={onSignOut} disabled={busy === "signout"}>
              {busy === "signout" ? "Signing out…" : "Sign out of this device"}
            </button>
          </div>
        </form>

        {canViewAcademic ? (
          <AcademicConfiguration canManage={canManageAcademic} onError={onAcademicError} onMessage={onAcademicMessage} />
        ) : null}
      </div>
    </AppShell>
  );
}
