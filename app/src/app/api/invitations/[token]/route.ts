import { NextResponse } from "next/server";
import { jsonFromBackend } from "@/lib/auth-cookie";
import { callBackend, unavailable } from "@/lib/backend";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const response = await callBackend(`/api/auth/invitations/${encodeURIComponent(token)}`);
  if (!response) return NextResponse.json(unavailable("check this invitation"), { status: 503 });
  const payload = await response.json().catch(() => ({ ok: false, message: "Something went wrong." }));
  return NextResponse.json(payload, { status: response.status });
}

export async function POST(request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { name?: unknown; password?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!name || password.length < 8) {
    return NextResponse.json(
      { ok: false, message: "Enter your name and a password of at least 8 characters." },
      { status: 400 },
    );
  }
  const response = await callBackend(`/api/auth/invitations/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, password }),
  });
  if (!response) return NextResponse.json(unavailable("activate this account"), { status: 503 });
  const payload = (await response.json().catch(() => null)) as {
    ok?: unknown;
    access_token?: unknown;
    message?: unknown;
    user?: unknown;
  } | null;
  return jsonFromBackend(response, payload ?? {}, "This invitation could not be accepted.");
}
