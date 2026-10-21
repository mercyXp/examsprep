import { NextResponse } from "next/server";
import { jsonFromBackend } from "@/lib/auth-cookie";
import { callBackend, TOKEN_COOKIE, unavailable } from "@/lib/backend";
import { cookies } from "next/headers";

type Body = {
  current_password?: unknown;
  new_password?: unknown;
};

export async function POST(request: Request) {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ ok: false, message: "Sign in to continue." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const currentPassword = typeof body?.current_password === "string" ? body.current_password : "";
  const newPassword = typeof body?.new_password === "string" ? body.new_password : "";
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ ok: false, message: "Enter your current and new password." }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ ok: false, message: "Use at least 8 characters for your new password." }, { status: 400 });
  }

  const response = await callBackend("/api/auth/password", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (!response) {
    return NextResponse.json(unavailable("update your password"), { status: 503 });
  }

  const payload = (await response.json().catch(() => null)) as {
    ok?: unknown;
    access_token?: unknown;
    message?: unknown;
    user?: unknown;
  } | null;

  return jsonFromBackend(response, payload ?? {}, "We couldn’t update your password.");
}
