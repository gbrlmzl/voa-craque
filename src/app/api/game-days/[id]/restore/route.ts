import type { NextRequest } from "next/server";
import { route } from "@/lib/http";
import { requireAdmin } from "@/lib/session";
import { restoreGameDay } from "@/services/gameday";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    await restoreGameDay(id, admin);
    return { ok: true };
  });
}
