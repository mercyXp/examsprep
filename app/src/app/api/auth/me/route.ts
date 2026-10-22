import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { callBackend, TOKEN_COOKIE, unavailable } from "@/lib/backend";

async function withToken(): Promise<{ token: string } | { response: NextResponse }> {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) {
    return { response: NextResponse.json({ ok: false, message: "Sign in to continue." }, { status: 401 }) };
  }
  return { token };
}

export async function GET() {
  const auth = await withToken();
  if ("response" in auth) return auth.response;
  const { token } = auth;

  const response = await callBackend("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response) {
    return NextResponse.json(unavailable("load your account"), { status: 503 });
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const message =
      typeof payload?.message === "string" && payload.message
        ? payload.message
        : "Sign in to continue.";
    return NextResponse.json({ ok: false, message }, { status: response.status });
  }

  return NextResponse.json({ ok: true, user: payload });
}

export async function PATCH(request: Request) {
  const auth = await withToken();
  if ("response" in auth) return auth.response;
  const { token } = auth;

  const body = await request.text();
  const response = await callBackend("/api/auth/me", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body,
  });
  if (!response) {
    return NextResponse.json(unavailable("update your profile"), { status: 503 });
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const message =
      typeof payload?.message === "string" && payload.message
        ? payload.message
        : "We couldn’t update your profile.";
    return NextResponse.json({ ok: false, message }, { status: response.status });
  }

  return NextResponse.json({ ok: true, user: payload });
}
