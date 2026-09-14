import type { NextRequest } from "next/server";
import { route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { buildLiveSnapshot } from "@/services/live";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Fallback de polling para quem nao consegue manter a conexao SSE aberta. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    await requireUser();
    const { id } = await ctx.params;
    return buildLiveSnapshot(id);
  });
}
