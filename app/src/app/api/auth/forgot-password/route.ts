import { NextResponse } from "next/server";

type Body = {
  email?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";

  if (!email) {
    return NextResponse.json({ ok: false, message: "Enter your email." }, { status: 400 });
  }

  return NextResponse.json(
    {
      ok: false,
      message: "We couldn’t send a reset link. Accounts aren’t connected yet.",
    },
    { status: 503 },
  );
}
