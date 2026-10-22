import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { callBackend, TOKEN_COOKIE, unavailable } from "@/lib/backend";

type Ctx = { params: Promise<{ lessonId: string; filename: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ ok: false, message: "Sign in to continue." }, { status: 401 });
  }
  const { lessonId, filename } = await ctx.params;
  const response = await callBackend(`/api/media/${lessonId}/${filename}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response) {
    return NextResponse.json(unavailable("open this file"), { status: 503 });
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ ok: false, message: "File not found." }));
    return NextResponse.json(payload, { status: response.status });
  }
  const body = await response.arrayBuffer();
  const type = response.headers.get("content-type") || "application/octet-stream";
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
