import { NextResponse } from "next/server";
import { jsonFromBackend } from "@/lib/auth-cookie";
import { callBackend, unavailable } from "@/lib/backend";

type Body = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!name || !email || !password) {
    return NextResponse.json(
      { ok: false, message: "Enter your name, email, and password." },
      { status: 400 },
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { ok: false, message: "Use at least 8 characters for your password." },
      { status: 400 },
    );
  }

  const response = await callBackend("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });

  if (!response) {
    return NextResponse.json(unavailable("create your account"), { status: 503 });
  }

  const payload = (await response.json().catch(() => null)) as {
    ok?: unknown;
    access_token?: unknown;
    message?: unknown;
  } | null;

  return jsonFromBackend(
    response,
    payload ?? {},
    "We couldn’t create your account. Please try again.",
  );
}
