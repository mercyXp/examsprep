export type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string; status: number };

export async function api<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || payload?.ok === false) {
    const message =
      typeof payload?.message === "string" && payload.message
        ? payload.message
        : "Something went wrong. Please try again.";
    return { ok: false, message, status: response.status };
  }
  return { ok: true, data: payload as T };
}
