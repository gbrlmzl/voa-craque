import type { NextRequest } from "next/server";
import { route } from "@/lib/http";
import { requireAdmin } from "@/lib/session";
import { matchActionSchema } from "@/lib/validation";
import { changeMatchState } from "@/services/match";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const { action } = matchActionSchema.parse(await req.json());
    await changeMatchState(id, action, admin);
    return { ok: true };
  });
}
