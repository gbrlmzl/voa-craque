import type { NextRequest } from "next/server";
import { route } from "@/lib/http";
import { requireAdmin } from "@/lib/session";
import { substitutionIdsSchema, substitutionSchema } from "@/lib/validation";
import { recordSubstitutions, undoSubstitutions } from "@/services/match";

export const dynamic = "force-dynamic";

/** Uma ou varias trocas do mesmo time, aplicadas juntas. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const input = substitutionSchema.parse(await req.json());
    return recordSubstitutions(id, input, admin);
  });
}

/**
 * Botao "Desfazer" do snackbar depois de trocar varios jogadores de uma vez:
 * `?ids=a,b,c` desfaz o lote inteiro ou nada. A troca simples tem a rota propria,
 * em /substitutions/[substitutionId].
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const ids = substitutionIdsSchema.parse(req.nextUrl.searchParams.get("ids") ?? "");
    await undoSubstitutions(id, ids, admin);
    return { ok: true };
  });
}
