import type { NextRequest } from "next/server";
import { route } from "@/lib/http";
import { requireSuperadmin } from "@/lib/session";
import { mmrAdjustSchema } from "@/lib/validation";
import { adjustMmr } from "@/services/rating";

export const dynamic = "force-dynamic";

/**
 * Correcao manual de um MMR, so do superadmin, com motivo e auditoria. Atencao:
 * a proxima recomputacao completa (npm run mmr:recompute) apaga o ajuste.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const superadmin = await requireSuperadmin();
    const { id } = await ctx.params;
    const input = mmrAdjustSchema.parse(await req.json());
    await adjustMmr(id, input.mmr, input.reason, superadmin);
    return { ok: true };
  });
}
