import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { callBackend, TOKEN_COOKIE, unavailable } from "@/lib/backend";

async function proxy(method: string, init?: RequestInit) {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ ok: false, message: "Sign in to continue." }, { status: 401 });
  }

  const response = await callBackend("/api/onboarding", {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body,
  });

  if (!response) {
    return NextResponse.json(unavailable("save your study plan"), { status: 503 });
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const message =
      typeof payload?.message === "string" && payload.message
        ? payload.message
        : "We couldn’t save your study plan.";
    return NextResponse.json({ ok: false, message }, { status: response.status });
  }

  return NextResponse.json({ ok: true, user: payload });
}

export async function GET() {
  return proxy("GET");
}

export async function PATCH(request: Request) {
  const body = await request.text();
  return proxy("PATCH", { body });
}
