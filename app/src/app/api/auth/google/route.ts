import { NextResponse } from "next/server";
import { callBackend, unavailable } from "@/lib/backend";

export async function POST() {
  const response = await callBackend("/api/auth/google", { method: "POST" });
  if (!response) {
    return NextResponse.json(unavailable("continue with Google"), { status: 503 });
  }

  const payload = (await response.json().catch(() => null)) as { message?: unknown } | null;
  const message =
    typeof payload?.message === "string" && payload.message
      ? payload.message
      : "Google sign-in isn’t connected yet.";

  return NextResponse.json({ ok: false, message }, { status: response.status || 503 });
}
