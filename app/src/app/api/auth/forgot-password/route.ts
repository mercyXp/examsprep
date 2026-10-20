import { NextResponse } from "next/server";
import { callBackend, unavailable } from "@/lib/backend";

type Body = {
  email?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";

  if (!email) {
    return NextResponse.json({ ok: false, message: "Enter your email." }, { status: 400 });
  }

  const response = await callBackend("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  if (!response) {
    return NextResponse.json(unavailable("send a reset link"), { status: 503 });
  }

  const payload = (await response.json().catch(() => null)) as { message?: unknown } | null;
  const message =
    typeof payload?.message === "string" && payload.message
      ? payload.message
      : "We couldn’t send a reset link. Email isn’t connected yet.";

  return NextResponse.json({ ok: false, message }, { status: response.status || 503 });
}
