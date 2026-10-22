import { NextResponse } from "next/server";
import { callBackend, unavailable } from "@/lib/backend";

type Body = {
  token?: unknown;
  password?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (token.length < 20 || password.length < 8) {
    return NextResponse.json(
      { ok: false, message: "Use the link from your email and a password of at least 8 characters." },
      { status: 400 },
    );
  }

  const response = await callBackend("/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });

  if (!response) {
    return NextResponse.json(unavailable("reset your password"), { status: 503 });
  }

  const payload = (await response.json().catch(() => null)) as { ok?: unknown; message?: unknown } | null;
  const message =
    typeof payload?.message === "string" && payload.message
      ? payload.message
      : "This reset link could not be used.";

  if (response.ok && payload?.ok === true) {
    return NextResponse.json({ ok: true, message });
  }

  return NextResponse.json({ ok: false, message }, { status: response.status || 502 });
}
