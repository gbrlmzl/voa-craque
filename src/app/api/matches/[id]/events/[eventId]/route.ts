import type { NextRequest } from "next/server";
import { route } from "@/lib/http";
import { requireAdmin } from "@/lib/session";
import { undoMatchEvent } from "@/services/match";

export const dynamic = "force-dynamic";

/** Botao "Desfazer" do snackbar. `?assistEventId=` leva junto a assistencia do gol. */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; eventId: string }> },
) {
  return route(async () => {
    const admin = await requireAdmin();
    const { id, eventId } = await ctx.params;
    const assistEventId = req.nextUrl.searchParams.get("assistEventId");
    await undoMatchEvent(id, eventId, admin, assistEventId);
    return { ok: true };
  });
}
