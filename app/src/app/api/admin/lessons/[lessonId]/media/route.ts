import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { callBackend, TOKEN_COOKIE, unavailable } from "@/lib/backend";

type Ctx = { params: Promise<{ lessonId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ ok: false, message: "Sign in to continue." }, { status: 401 });
  }
  const { lessonId } = await ctx.params;
  const incoming = new URL(request.url);
  const contentType = request.headers.get("content-type") || "";
  const body = await request.arrayBuffer();
  const response = await callBackend(`/api/admin/lessons/${lessonId}/media${incoming.search}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
    body,
  });
  if (!response) {
    return NextResponse.json(unavailable("upload this file"), { status: 503 });
  }
  const payload = await response.json().catch(() => ({ ok: false, message: "Something went wrong." }));
  return NextResponse.json(payload, { status: response.status });
}
