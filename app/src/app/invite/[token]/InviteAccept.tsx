"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import RevealPasswordField from "@/app/components/auth/RevealPasswordField";
import { afterAuthPath } from "@/lib/auth";

type Preview = {
  ok?: boolean;
  email?: string;
  roleLabel?: string;
  status?: string;
  message?: string;
};

export default function InviteAccept() {
  const params = useParams<{ token: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    void fetch(`/api/invitations/${encodeURIComponent(token)}`)
      .then((response) => response.json())
      .then((payload: Preview) => setPreview(payload))
      .catch(() => setPreview({ ok: false, message: "The invitation service isn’t running." }));
  }, [token]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Those passwords don’t match.");
      return;
    }
    setBusy(true);
    const response = await fetch(`/api/invitations/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      roles?: string[];
      onboardingCompleted?: boolean;
    } | null;
    setBusy(false);
    if (!response.ok || !payload?.ok) {
      setError(payload?.message || "This invitation could not be accepted.");
      return;
    }
    router.replace(afterAuthPath(Boolean(payload.onboardingCompleted), payload.roles ?? []));
  }

  const ready = preview?.ok && preview.status === "pending";

  return (
    <main className="invite-shell">
      <form className="invite-card" onSubmit={onSubmit}>
        <p className="invite-brand">ExamsPrep</p>
        <h1>Activate your staff account</h1>
        {!preview ? <p>Checking this invitation…</p> : null}
        {preview && !preview.ok ? <p>{preview.message || "This invitation link is not valid."}</p> : null}
        {preview?.ok && preview.status !== "pending" ? (
          <p>
            {preview.status === "accepted"
              ? "This invitation has already been used."
              : preview.status === "expired"
                ? "This invitation has expired. Ask a super administrator to send a new one."
                : "This invitation is no longer valid."}
          </p>
        ) : null}
        {ready ? (
          <>
            <p>
              {preview.roleLabel} invitation for <strong>{preview.email}</strong>. Choose a password to activate this
              account. It expires 24 hours after it was sent and works once.
            </p>
            <label>
              Your name
              <input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" />
            </label>
            <RevealPasswordField
              label="Password"
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
              {busy ? "Activating…" : "Activate account"}
            </button>
          </>
        ) : null}
      </form>
    </main>
  );
}
