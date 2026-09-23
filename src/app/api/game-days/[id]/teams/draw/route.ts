import type { NextRequest } from "next/server";
import { route } from "@/lib/http";
import { requireAdmin } from "@/lib/session";
import { drawSchema } from "@/lib/validation";
import { drawTeams } from "@/services/teams";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const input = drawSchema.parse(body ?? {});
    const summary = await drawTeams(id, admin, input.seed);
    return summary;
  });
}
