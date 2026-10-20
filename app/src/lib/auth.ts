export type SignInResult =
  | { ok: true }
  | { ok: false; message: string };

async function readResult(response: Response): Promise<SignInResult> {
  const data: unknown = await response.json().catch(() => null);
  const payload = data && typeof data === "object" ? (data as { ok?: unknown; message?: unknown }) : null;

  if (response.ok && payload?.ok === true) {
    return { ok: true };
  }

  const message =
    typeof payload?.message === "string" && payload.message
      ? payload.message
      : "Something went wrong. Please try again.";

  return { ok: false, message };
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  return readResult(response);
}

export async function signInWithGoogle(): Promise<SignInResult> {
  const response = await fetch("/api/auth/google", { method: "POST" });
  return readResult(response);
}

export async function createAccount(
  name: string,
  email: string,
  password: string,
): Promise<SignInResult> {
  const response = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });

  return readResult(response);
}

export async function requestPasswordReset(email: string): Promise<SignInResult> {
  const response = await fetch("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  return readResult(response);
}
