import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { callBackend, TOKEN_COOKIE, unavailable } from "@/lib/backend";

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, ctx: Ctx) {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ ok: false, message: "Sign in to continue." }, { status: 401 });
  }
  const { path } = await ctx.params;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const range = request.headers.get("range");
  if (range) headers.Range = range;
  const response = await callBackend(`/api/${path.join("/")}`, { headers });
  if (!response) {
    return NextResponse.json(unavailable("open this file"), { status: 503 });
  }
  if (!response.ok && response.status !== 206) {
    const payload = await response.json().catch(() => ({ ok: false, message: "File not found." }));
    return NextResponse.json(payload, { status: response.status });
  }
  const body = await response.arrayBuffer();
  const outbound = new Headers();
  outbound.set("Content-Type", response.headers.get("content-type") || "application/octet-stream");
  outbound.set("Cache-Control", "private, max-age=3600");
  const accept = response.headers.get("accept-ranges");
  const contentRange = response.headers.get("content-range");
  const length = response.headers.get("content-length");
  if (accept) outbound.set("Accept-Ranges", accept);
  if (contentRange) outbound.set("Content-Range", contentRange);
  if (length) outbound.set("Content-Length", length);
  return new NextResponse(body, { status: response.status, headers: outbound });
}
