import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { callBackend, TOKEN_COOKIE, unavailable } from "@/lib/backend";

export async function proxyAuthed(request: Request, backendPath: string, action: string) {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ ok: false, message: "Sign in to continue." }, { status: 401 });
  }

  const incoming = new URL(request.url);
  const target = `${backendPath}${incoming.search}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const contentType = request.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.text();
  const response = await callBackend(target, { method, headers, body });
  if (!response) {
    return NextResponse.json(unavailable(action), { status: 503 });
  }

  const payload = await response.json().catch(() => ({ ok: false, message: "Something went wrong." }));
  return NextResponse.json(payload, { status: response.status });
}
