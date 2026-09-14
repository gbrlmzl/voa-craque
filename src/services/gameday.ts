import { prisma } from "@/lib/prisma";
import { conflict, notFound } from "@/lib/http";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { publishGameDay } from "@/lib/realtime";
import type { CurrentUser } from "@/lib/session";
import { evaluateOutcome } from "@/lib/match-engine";
import { finalizeMatch } from "@/services/match";

/**
 * Encerra a pelada do dia: a partida em andamento e fechada pelo placar atual,
 * a partida que ainda nao comecou some, a fila zera e ninguem mais inicia nada.
 */
export async function finishGameDay(gameDayId: string, actor: CurrentUser): Promise<void> {
  const gameDay = await prisma.gameDay.findUnique({
    where: { id: gameDayId },
    include: { matches: { orderBy: { orderIndex: "asc" } } },
  });
  if (!gameDay) throw notFound("Pelada não encontrada.");
  if (gameDay.status === "FINISHED") throw conflict("Esta pelada já foi encerrada.");

  const now = Date.now();
  const open = gameDay.matches.find((match) => match.status === "RUNNING" || match.status === "PAUSED");

  if (open) {
    const outcome = evaluateOutcome({
      score: { home: open.homeScore, away: open.awayScore },
      clock: {
        status: open.status,
        durationMs: open.durationMs,
        remainingMs: open.remainingMs,
        lastResumedAt: open.lastResumedAt?.getTime() ?? null,
      },
      now,
      goalsToWin: gameDay.goalsToWin,
    });

    await finalizeMatch({
      matchId: open.id,
      actor,
      reason: outcome.reason ?? "MANUAL",
      result: outcome.result ?? "DRAW",
      now,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.match.deleteMany({ where: { gameDayId, status: "SCHEDULED" } });
    await tx.team.updateMany({ where: { gameDayId }, data: { queuePosition: null } });
    await tx.gameDay.update({
      where: { id: gameDayId },
      data: { status: "FINISHED", finishedAt: new Date(now) },
    });
  });

  const totals = await prisma.match.aggregate({
    where: { gameDayId, status: "FINISHED" },
    _count: { _all: true },
  });

  await recordAudit(actor, {
    action: AUDIT_ACTIONS.GAMEDAY_FINISHED,
    entity: "GameDay",
    entityId: gameDayId,
    summary: `${gameDay.title} encerrada com ${totals._count._all} partidas`,
    before: { status: gameDay.status },
    after: { status: "FINISHED", matches: totals._count._all },
  });
  publishGameDay(gameDayId, "gameday-finished");
}
