import type { NextRequest } from "next/server";
import { route } from "@/lib/http";
import { requireAdmin } from "@/lib/session";
import { manualTeamsSchema } from "@/lib/validation";
import { setTeamsManually } from "@/services/teams";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const input = manualTeamsSchema.parse(await req.json());
    await setTeamsManually(id, admin, input);
    return { ok: true };
  });
}
