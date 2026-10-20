import { NextResponse } from "next/server";

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

  return NextResponse.json(
    {
      ok: false,
      message: "We couldn’t sign you in. Accounts aren’t connected yet.",
    },
    { status: 503 },
  );
}
