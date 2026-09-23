import type { NextRequest } from "next/server";
import { route } from "@/lib/http";
import { requireAdmin } from "@/lib/session";
import { undoMatchEvent } from "@/services/match";

export const dynamic = "force-dynamic";

/** Botao "Desfazer" do snackbar. */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; eventId: string }> },
) {
  return route(async () => {
    const admin = await requireAdmin();
    const { id, eventId } = await ctx.params;
    await undoMatchEvent(id, eventId, admin);
    return { ok: true };
  });
}
