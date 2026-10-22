"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import RevealPasswordField from "@/app/components/auth/RevealPasswordField";
import AppShell from "@/app/components/shell/AppShell";
import { changePassword, getSessionUser, signOut, updateProfile, type SessionUser } from "@/lib/auth";
import { loadCatalogue } from "@/lib/learn-api";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [limit, setLimit] = useState(7);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"profile" | "password" | "signout" | null>(null);

  useEffect(() => {
    getSessionUser().then((session) => {
      if (!session) return;
      setUser(session);
      setName(session.name);
    });
    loadCatalogue().then((result) => {
      if (!result.ok) return;
      setActiveCount(result.data.activeCount);
      setLimit(result.data.limit);
    });
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
      setError("Those passwords don’t match.");
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
    <AppShell variant="student" title="Settings" subtitle="Profile and security.">
      <div className="dash-body settings-page">
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
              <input value="Student" readOnly />
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
            <RevealPasswordField
              label="Current password"
              name="current-password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={setCurrentPassword}
              minLength={1}
            />
            <RevealPasswordField
              label="New password"
              name="new-password"
              autoComplete="new-password"
              value={newPassword}
              onChange={setNewPassword}
            />
            <RevealPasswordField
              label="Confirm new password"
              name="confirm-password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={setConfirmPassword}
            />
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

        <section className="settings-panel">
          <header>
            <h2>My Programme & Courses</h2>
            <p>Your programme stays fixed. You choose which published modules to study.</p>
          </header>
          <div className="programme-row">
            <div>
              <p className="dash-kicker">My programme</p>
              <strong>{user?.programme || "No programme selected"}</strong>
              <span>One programme per student</span>
            </div>
            <span className="programme-lock" aria-label="Programme is locked">
              Locked
            </span>
          </div>
          <Link className="programme-row" href="/dashboard/settings/courses">
            <div>
              <p className="dash-kicker">Manage my courses</p>
              <strong>
                {activeCount === null ? "Browse modules" : `${activeCount} of ${limit} selected`}
              </strong>
              <span>Add or remove modules from any year or semester in your programme.</span>
            </div>
            <span aria-hidden="true">›</span>
          </Link>
          <Link className="programme-row" href="/dashboard/settings/history">
            <div>
              <p className="dash-kicker">My learning history</p>
              <strong>Previous modules</strong>
              <span>Removed modules stay here with their lesson progress.</span>
            </div>
            <span aria-hidden="true">›</span>
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
