import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      message: "Google sign-in isn’t connected yet.",
    },
    { status: 503 },
  );
}
