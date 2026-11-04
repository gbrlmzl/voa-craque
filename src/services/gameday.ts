import { prisma } from "@/lib/prisma";
import { conflict, notFound } from "@/lib/http";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { publishGameDay } from "@/lib/realtime";
import type { CurrentUser } from "@/lib/session";
import { canCancel, canFinish, canStart } from "@/lib/gameday-lifecycle";
import { evaluateOutcome } from "@/lib/match-engine";
import { deleteScheduledMatch, finalizeMatch } from "@/services/match";
import { applyGameDayRatings, auditRatingOutcome } from "@/services/rating";

const NEEDS_TEAMS = "Monte os times antes de iniciar a pelada.";

/**
 * "Iniciar pelada": o marco de que ela comecou. Passa de TEAMS_SET para LIVE,
 * trava os times e libera o painel ao vivo e o acompanhamento dos jogadores. O
 * apito da primeira partida vem depois, no painel. Dois organizadores tocando
 * juntos nao e erro: o segundo recebe `alreadyStarted` e vai para o painel.
 */
export async function startGameDay(
  gameDayId: string,
  actor: CurrentUser,
): Promise<{ alreadyStarted: boolean }> {
  const load = () =>
    prisma.gameDay.findUnique({
      where: { id: gameDayId },
      include: { teams: { select: { id: true } }, matches: { select: { id: true }, take: 1 } },
    });
  const gameDay = await load();
  if (!gameDay) throw notFound("Pelada não encontrada.");
  if (gameDay.status === "LIVE") return { alreadyStarted: true };
  if (gameDay.status === "FINISHED") throw conflict("Esta pelada já foi encerrada.");
  if (gameDay.status === "CANCELED") throw conflict("Esta pelada foi cancelada.");
  if (!canStart(gameDay.status)) throw conflict(NEEDS_TEAMS);
  // Nao deveria acontecer em TEAMS_SET: o sorteio ja cria os times e a partida de abertura.
  if (gameDay.teams.length < 2 || gameDay.matches.length === 0) throw conflict(NEEDS_TEAMS);

  const started = await prisma.gameDay.updateMany({
    where: { id: gameDayId, status: "TEAMS_SET" },
    data: { status: "LIVE" },
  });
  if (started.count === 0) {
    // Outro pedido passou na frente: se virou LIVE, o resultado e o mesmo; senao, o motivo e o status atual.
    const current = await load();
    if (current?.status === "LIVE") return { alreadyStarted: true };
    throw conflict(
      current?.status === "FINISHED"
        ? "Esta pelada já foi encerrada."
        : current?.status === "CANCELED"
          ? "Esta pelada foi cancelada."
          : NEEDS_TEAMS,
    );
  }

  await recordAudit(actor, {
    action: AUDIT_ACTIONS.GAMEDAY_STARTED,
    entity: "GameDay",
    entityId: gameDayId,
    summary: `${gameDay.title} iniciada`,
    before: { status: gameDay.status },
    after: { status: "LIVE" },
  });
  publishGameDay(gameDayId, "gameday-started");
  return { alreadyStarted: false };
}

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
  if (gameDay.status === "CANCELED") throw conflict("Esta pelada foi cancelada.");
  // Antes de fechar a partida aberta e de aplicar o MMR: encerrar o que nem comecou deixaria
  // ranking e estatistica de uma pelada que nao existiu. Para desistir, e "Cancelar pelada".
  if (!canFinish({ status: gameDay.status, matchStarted: gameDay.matches.some((match) => match.status !== "SCHEDULED") })) {
    throw conflict('Nenhuma partida começou. Para desistir da pelada, use "Cancelar pelada" nas configurações.');
  }

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

  const rating = await prisma.$transaction(
    async (tx) => {
      const scheduled = await tx.match.findMany({
        where: { gameDayId, status: "SCHEDULED" },
        select: { id: true },
      });
      for (const match of scheduled) {
        await deleteScheduledMatch(tx, gameDayId, match.id);
      }
      await tx.team.updateMany({ where: { gameDayId }, data: { queuePosition: null } });
      // Condicional ao status: dois pedidos ao mesmo tempo nao encerram nem pontuam duas vezes.
      const closed = await tx.gameDay.updateMany({
        where: { id: gameDayId, status: { notIn: ["FINISHED", "CANCELED"] } },
        data: { status: "FINISHED", finishedAt: new Date(now) },
      });
      if (closed.count === 0) throw conflict("Esta pelada já foi encerrada.");

      // Na mesma transacao de proposito: depois de FINISHED nada mais muda no historico
      // (undoMatchEvent recusa), entao uma pelada encerrada nunca pode ficar sem MMR.
      return applyGameDayRatings(tx, gameDayId);
    },
    { timeout: 30_000 },
  );

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
  await auditRatingOutcome(actor, gameDay, rating);
  publishGameDay(gameDayId, "gameday-finished");
}

const CANCEL_TOO_LATE = 'A primeira partida já começou. Para terminar a pelada, use "Encerrar pelada".';

/**
 * Desiste da pelada antes do primeiro apito: fecha as inscricoes, apaga times,
 * reservas e a partida agendada e deixa a pelada como CANCELED. Inscricoes e
 * pagamentos ficam (o organizador ainda precisa saber quem pagou para devolver).
 * Nao mexe no MMR: nao ha partida encerrada, e a recomputacao so le peladas FINISHED.
 */
export async function cancelGameDay(gameDayId: string, actor: CurrentUser): Promise<void> {
  const gameDay = await prisma.gameDay.findUnique({
    where: { id: gameDayId },
    include: { matches: { where: { status: { not: "SCHEDULED" } }, select: { id: true }, take: 1 } },
  });
  if (!gameDay) throw notFound("Pelada não encontrada.");
  if (gameDay.status === "FINISHED") throw conflict("Esta pelada já foi encerrada.");
  if (gameDay.status === "CANCELED") throw conflict("Esta pelada já foi cancelada.");
  if (!canCancel({ status: gameDay.status, matchStarted: gameDay.matches.length > 0 })) {
    throw conflict(CANCEL_TOO_LATE);
  }

  await prisma.$transaction(async (tx) => {
    // De novo dentro da transacao: o primeiro apito pode ter acontecido desde a leitura acima.
    const started = await tx.match.findFirst({
      where: { gameDayId, status: { not: "SCHEDULED" } },
      select: { id: true },
    });
    if (started) throw conflict(CANCEL_TOO_LATE);

    await tx.match.deleteMany({ where: { gameDayId } });
    await tx.gameDayReserve.deleteMany({ where: { gameDayId } });
    await tx.team.deleteMany({ where: { gameDayId } });
    const canceled = await tx.gameDay.updateMany({
      where: { id: gameDayId, status: { in: ["OPEN", "TEAMS_SET", "LIVE"] } },
      data: { status: "CANCELED", canceledAt: new Date() },
    });
    if (canceled.count === 0) throw conflict("Esta pelada já foi cancelada.");
  });

  await recordAudit(actor, {
    action: AUDIT_ACTIONS.GAMEDAY_CANCELED,
    entity: "GameDay",
    entityId: gameDayId,
    summary: `${gameDay.title} cancelada`,
    before: { status: gameDay.status },
    after: { status: "CANCELED" },
  });
  publishGameDay(gameDayId, "gameday-canceled");
}

export async function restoreGameDay(gameDayId: string, actor: CurrentUser): Promise<void> {
  const gameDay = await prisma.gameDay.findUnique({
    where: { id: gameDayId },
    include: { matches: { where: { status: { not: "SCHEDULED" } }, select: { id: true } } },
  });
  if (!gameDay) throw notFound("Pelada não encontrada.");
  if (gameDay.status !== "TEAMS_SET") {
    throw conflict("Só é possível restaurar uma pelada com times definidos.");
  }
  if (gameDay.matches.length > 0) {
    throw conflict("A pelada já começou. Não dá para restaurá-la agora.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.match.deleteMany({ where: { gameDayId } });
    await tx.gameDayReserve.deleteMany({ where: { gameDayId } });
    await tx.team.deleteMany({ where: { gameDayId } });
    await tx.gameDay.update({ where: { id: gameDayId }, data: { status: "OPEN" } });
  });

  await recordAudit(actor, {
    action: AUDIT_ACTIONS.GAMEDAY_RESTORED,
    entity: "GameDay",
    entityId: gameDayId,
    summary: `${gameDay.title} restaurada para inscrições`,
    before: { status: gameDay.status },
    after: { status: "OPEN" },
  });
  publishGameDay(gameDayId, "gameday-restored");
}
