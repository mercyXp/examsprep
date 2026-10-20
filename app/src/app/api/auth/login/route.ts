import { NextResponse } from "next/server";
import { jsonFromBackend } from "@/lib/auth-cookie";
import { callBackend, unavailable } from "@/lib/backend";

type Body = {
  email?: unknown;
  password?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json(
      { ok: false, message: "Enter your email and password." },
      { status: 400 },
    );
  }

  const response = await callBackend("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response) {
    return NextResponse.json(unavailable("sign you in"), { status: 503 });
  }

  const payload = (await response.json().catch(() => null)) as {
    ok?: unknown;
    access_token?: unknown;
    message?: unknown;
  } | null;

  return jsonFromBackend(
    response,
    payload ?? {},
    "We couldn’t sign you in. Check your email and password.",
  );
}
