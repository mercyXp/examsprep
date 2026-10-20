const TOKEN_COOKIE = "examsprep_token";

export { TOKEN_COOKIE };

export function backendUrl(path: string) {
  const base = (process.env.API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  return `${base}${path}`;
}

export async function callBackend(path: string, init: RequestInit = {}) {
  try {
    return await fetch(backendUrl(path), {
      ...init,
      cache: "no-store",
    });
  } catch {
    return null;
  }
}

export function unavailable(action: string) {
  return {
    ok: false as const,
    message: `We couldn’t ${action}. The account service isn’t running.`,
  };
}
