import { proxyAuthed } from "@/lib/proxy";

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(request: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxyAuthed(request, `/api/learn/${path.join("/")}`, "load your courses");
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
