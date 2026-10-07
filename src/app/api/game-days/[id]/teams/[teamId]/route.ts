import type { NextRequest } from "next/server";
import { route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { buildTeamSummary } from "@/services/team-summary";

export const dynamic = "force-dynamic";

/** Elenco e retrospecto de um time, para o modal da fila. Leitura, aberta a qualquer logado. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; teamId: string }> }) {
  return route(async () => {
    await requireUser();
    const { id, teamId } = await ctx.params;
    return buildTeamSummary(id, teamId);
  });
}
