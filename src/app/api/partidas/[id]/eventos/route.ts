import type { NextRequest } from "next/server";
import { route } from "@/lib/http";
import { requireAdmin } from "@/lib/session";
import { matchEventSchema } from "@/lib/validation";
import { recordMatchEvent } from "@/services/match";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const input = matchEventSchema.parse(await req.json());
    return recordMatchEvent(id, input, admin);
  });
}
