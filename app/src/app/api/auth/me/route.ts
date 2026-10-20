import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { callBackend, TOKEN_COOKIE, unavailable } from "@/lib/backend";

export async function GET() {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ ok: false, message: "Sign in to continue." }, { status: 401 });
  }

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
