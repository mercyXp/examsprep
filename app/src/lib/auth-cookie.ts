import { NextResponse } from "next/server";
import { TOKEN_COOKIE } from "@/lib/backend";

const WEEK = 60 * 60 * 24 * 7;

type AuthPayload = {
  ok?: unknown;
  access_token?: unknown;
  message?: unknown;
  user?: unknown;
};

function onboardingCompleted(user: unknown) {
  if (!user || typeof user !== "object") return false;
  return (user as { onboarding_completed?: unknown }).onboarding_completed === true;
}

function userRoles(user: unknown) {
  if (!user || typeof user !== "object") return [];
  const roles = (user as { roles?: unknown }).roles;
  return Array.isArray(roles) ? roles.filter((item): item is string => typeof item === "string") : [];
}

export function jsonFromBackend(response: Response, payload: AuthPayload, fallback: string) {
  if (response.ok && payload.ok === true && typeof payload.access_token === "string") {
    const next = NextResponse.json({
      ok: true,
      onboardingCompleted: onboardingCompleted(payload.user),
      roles: userRoles(payload.user),
    });
    next.cookies.set({
      name: TOKEN_COOKIE,
      value: payload.access_token,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: WEEK,
      secure: process.env.NODE_ENV === "production",
    });
    return next;
  }

  const message = typeof payload.message === "string" && payload.message ? payload.message : fallback;
  return NextResponse.json({ ok: false, message }, { status: response.status || 502 });
}
