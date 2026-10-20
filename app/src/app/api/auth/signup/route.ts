import { NextResponse } from "next/server";

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

  return NextResponse.json(
    {
      ok: false,
      message: "We couldn’t create your account. Accounts aren’t connected yet.",
    },
    { status: 503 },
  );
}
