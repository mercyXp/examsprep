import { jsonFromBackend } from "@/lib/auth-cookie";
import { callBackend, unavailable } from "@/lib/backend";
import { NextResponse } from "next/server";

type Body = {
  accessToken?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken.trim() : "";
  if (accessToken.length < 20) {
    return NextResponse.json({ ok: false, message: "Google sign-in could not be completed." }, { status: 400 });
  }

  const response = await callBackend("/api/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: accessToken }),
  });

  if (!response) {
    return NextResponse.json(unavailable("continue with Google"), { status: 503 });
  }

  const payload = (await response.json().catch(() => null)) as {
    ok?: unknown;
    access_token?: unknown;
    message?: unknown;
    user?: unknown;
  } | null;

  return jsonFromBackend(response, payload ?? {}, "Google sign-in could not be completed.");
}
