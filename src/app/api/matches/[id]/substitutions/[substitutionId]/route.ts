import type { NextRequest } from "next/server";
import { route } from "@/lib/http";
import { requireAdmin } from "@/lib/session";
import { undoSubstitution } from "@/services/match";

export const dynamic = "force-dynamic";

/** Botao "Desfazer" do snackbar depois de uma substituicao. */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; substitutionId: string }> },
) {
  return route(async () => {
    const admin = await requireAdmin();
    const { id, substitutionId } = await ctx.params;
    await undoSubstitution(id, substitutionId, admin);
    return { ok: true };
  });
}
