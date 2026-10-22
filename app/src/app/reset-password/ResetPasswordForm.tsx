"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { resetPassword } from "@/lib/auth";

export default function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
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
            <label>
              New password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
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
