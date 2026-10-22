"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import RevealPasswordField from "@/app/components/auth/RevealPasswordField";
import { resetPassword } from "@/lib/auth";

export default function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Those passwords don’t match.");
      return;
    }
    setBusy(true);
    const result = await resetPassword(token, password);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDone(result.message);
  }

  return (
    <main className="invite-shell">
      <form className="invite-card" onSubmit={onSubmit}>
        <p className="invite-brand">ExamsPrep</p>
        <h1>Choose a new password</h1>
        {!token ? <p>This reset link is not valid. Request a new one from the sign-in page.</p> : null}
        {done ? (
          <p>
            {done} <Link href="/login">Log in</Link>
          </p>
        ) : null}
        {token && !done ? (
          <>
            <p>This link works once and expires 15 minutes after it was sent.</p>
            <RevealPasswordField
              label="New password"
              name="password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
            />
            <RevealPasswordField
              label="Confirm password"
              name="confirm"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
            />
            {error ? <p className="cms-error">{error}</p> : null}
            <button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Update password"}
            </button>
          </>
        ) : null}
      </form>
    </main>
  );
}
