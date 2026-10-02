import type { NextRequest } from "next/server";
import { route } from "@/lib/http";
import { requireAdmin } from "@/lib/session";
import { substitutionSchema } from "@/lib/validation";
import { recordSubstitution } from "@/services/match";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const input = substitutionSchema.parse(await req.json());
    return recordSubstitution(id, input, admin);
  });
}
