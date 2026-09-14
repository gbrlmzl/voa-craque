import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { conflict, notFound, route } from "@/lib/http";
import { requireAdmin } from "@/lib/session";
import { gameDaySchema } from "@/lib/validation";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { publishGameDay } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;

    const before = await prisma.gameDay.findUnique({ where: { id } });
    if (!before) throw notFound("Pelada não encontrada.");
    if (before.status === "FINISHED") throw conflict("Pelada encerrada não pode ser editada.");

    const input = gameDaySchema.parse(await req.json());

    const started = await prisma.match.findFirst({
      where: { gameDayId: id, status: { not: "SCHEDULED" } },
      select: { id: true },
    });
    if (started && input.teamSize !== before.teamSize) {
      throw conflict("A pelada já começou: o tamanho do time não muda mais.");
    }

    const gameDay = await prisma.gameDay.update({
      where: { id },
      data: {
        title: input.title,
        scheduledAt: input.scheduledAt,
        location: input.location,
        pricePerPlayerCents: input.pricePerPlayerCents,
        matchDurationSec: input.matchDurationSec,
        goalsToWin: input.goalsToWin,
        maxPlayers: input.maxPlayers,
        teamSize: input.teamSize,
        pixKey: input.pixKey || null,
        notes: input.notes || null,
      },
    });

    // A partida que ainda nao comecou acompanha a nova duracao.
    await prisma.match.updateMany({
      where: { gameDayId: id, status: "SCHEDULED" },
      data: { durationMs: input.matchDurationSec * 1000, remainingMs: input.matchDurationSec * 1000 },
    });

    await recordAudit(admin, {
      action: AUDIT_ACTIONS.GAMEDAY_UPDATED,
      entity: "GameDay",
      entityId: id,
      summary: gameDay.title,
      before,
      after: gameDay,
    });
    publishGameDay(id, "gameday-updated");

    return { ok: true };
  });
}
