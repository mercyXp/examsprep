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

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  roles: string[];
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const response = await fetch("/api/auth/me", { cache: "no-store" });
  const data: unknown = await response.json().catch(() => null);
  const payload = data && typeof data === "object" ? (data as { ok?: unknown; user?: unknown }) : null;
  const user = payload?.user && typeof payload.user === "object" ? (payload.user as Record<string, unknown>) : null;

  if (!response.ok || payload?.ok !== true || !user) return null;

  const id = typeof user.id === "string" ? user.id : "";
  const name = typeof user.name === "string" ? user.name : "";
  const email = typeof user.email === "string" ? user.email : "";
  const roles = Array.isArray(user.roles) ? user.roles.filter((item): item is string => typeof item === "string") : [];

  if (!id || !email) return null;
  return { id, name, email, roles };
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function requestPasswordReset(email: string): Promise<SignInResult> {
  const response = await fetch("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  return readResult(response);
}
