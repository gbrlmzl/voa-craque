import { Prisma } from "@/generated/prisma/client";
import type { Match, MatchEndReason } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, conflict, notFound } from "@/lib/http";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { publishGameDay, withLock } from "@/lib/realtime";
import type { CurrentUser } from "@/lib/session";
import {
  applyGoal,
  evaluateOutcome,
  pauseClock,
  remainingAt,
  resumeClock,
  rotateQueue,
  startClock,
  stopClock,
  type MatchClock,
  type MatchResult,
  type Side,
} from "@/lib/match-engine";

type Tx = Prisma.TransactionClient;
type QueueSnapshot = { id: string; queuePosition: number | null }[];

function clockOf(match: Match): MatchClock {
  return {
    status: match.status,
    durationMs: match.durationMs,
    remainingMs: match.remainingMs,
    lastResumedAt: match.lastResumedAt?.getTime() ?? null,
  };
}

async function loadMatch(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { gameDay: true },
  });
  if (!match) throw notFound("Partida não encontrada.");
  return match;
}

async function takeQueueSnapshot(tx: Tx, gameDayId: string): Promise<QueueSnapshot> {
  const teams = await tx.team.findMany({
    where: { gameDayId },
    select: { id: true, queuePosition: true },
    orderBy: { name: "asc" },
  });
  return teams.map((team) => ({ id: team.id, queuePosition: team.queuePosition }));
}

async function waitingTeamIds(tx: Tx, gameDayId: string): Promise<string[]> {
  const teams = await tx.team.findMany({
    where: { gameDayId, queuePosition: { not: null } },
    select: { id: true },
    orderBy: { queuePosition: "asc" },
  });
  return teams.map((team) => team.id);
}

async function applyQueue(tx: Tx, queue: string[], playing: string[]): Promise<void> {
  for (const [position, teamId] of queue.entries()) {
    await tx.team.update({ where: { id: teamId }, data: { queuePosition: position } });
  }
  for (const teamId of playing) {
    await tx.team.update({ where: { id: teamId }, data: { queuePosition: null } });
  }
}

async function createMatch(
  tx: Tx,
  gameDay: { id: string; matchDurationSec: number },
  homeTeamId: string,
  awayTeamId: string,
) {
  const previous = await tx.match.aggregate({
    where: { gameDayId: gameDay.id },
    _max: { orderIndex: true },
  });
  const durationMs = gameDay.matchDurationSec * 1000;

  return tx.match.create({
    data: {
      gameDayId: gameDay.id,
      orderIndex: (previous._max.orderIndex ?? 0) + 1,
      homeTeamId,
      awayTeamId,
      durationMs,
      remainingMs: durationMs,
    },
  });
}

/**
 * Cria a primeira partida da pelada assim que os times ficam prontos: os dois
 * primeiros entram em quadra, o resto fica na fila.
 */
export async function ensureOpeningMatch(gameDayId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const gameDay = await tx.gameDay.findUnique({
      where: { id: gameDayId },
      select: { id: true, matchDurationSec: true },
    });
    if (!gameDay) throw notFound("Pelada não encontrada.");

    const teams = await tx.team.findMany({
      where: { gameDayId },
      select: { id: true },
      orderBy: { name: "asc" },
    });
    if (teams.length < 2) throw conflict("São necessários pelo menos dois times.");

    const existing = await tx.match.findFirst({ where: { gameDayId } });
    if (existing) return;

    await applyQueue(
      tx,
      teams.slice(2).map((team) => team.id),
      [teams[0].id, teams[1].id],
    );
    await createMatch(tx, gameDay, teams[0].id, teams[1].id);
  });
}

/**
 * Encerra a partida, contabiliza o resultado, gira a fila e ja deixa a proxima
 * partida montada. Guarda a fila anterior para o caso de o admin desfazer o gol.
 */
export async function finalizeMatch(params: {
  matchId: string;
  actor: CurrentUser | null;
  reason: MatchEndReason;
  result: MatchResult;
  now: number;
}): Promise<void> {
  const { matchId, actor, reason, result, now } = params;

  await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({ where: { id: matchId }, include: { gameDay: true } });
    if (!match) throw notFound("Partida não encontrada.");
    if (match.status === "FINISHED") return;

    const snapshot = await takeQueueSnapshot(tx, match.gameDayId);
    const queue = await waitingTeamIds(tx, match.gameDayId);
    const rotation = rotateQueue({
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      result,
      queue,
    });

    const clock = stopClock(clockOf(match), now);
    const winnerTeamId =
      result === "HOME" ? match.homeTeamId : result === "AWAY" ? match.awayTeamId : null;

    await tx.match.update({
      where: { id: match.id },
      data: {
        status: "FINISHED",
        remainingMs: clock.remainingMs,
        lastResumedAt: null,
        endedAt: new Date(now),
        result,
        endReason: reason,
        winnerTeamId,
        queueSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    const playing = [rotation.nextHomeTeamId, rotation.nextAwayTeamId].filter(
      (id): id is string => Boolean(id),
    );
    await applyQueue(tx, rotation.queue, playing);

    if (match.gameDay.status !== "FINISHED" && rotation.nextHomeTeamId && rotation.nextAwayTeamId) {
      await createMatch(tx, match.gameDay, rotation.nextHomeTeamId, rotation.nextAwayTeamId);
    }
  });

  const finished = await loadMatch(matchId);
  await recordAudit(actor, {
    action: AUDIT_ACTIONS.MATCH_FINISHED,
    entity: "Match",
    entityId: matchId,
    summary: `Partida ${finished.orderIndex}: ${finished.homeScore} x ${finished.awayScore} (${result})`,
    after: {
      result,
      reason,
      homeScore: finished.homeScore,
      awayScore: finished.awayScore,
    },
  });
  publishGameDay(finished.gameDayId, "match-finished");
}

/** Encerra a partida se o cronometro tiver zerado. Chamada pelo canal ao vivo. */
export async function syncMatchClock(gameDayId: string, now = Date.now()): Promise<boolean> {
  return withLock(`clock:${gameDayId}`, async () => {
    const match = await prisma.match.findFirst({
      where: { gameDayId, status: "RUNNING" },
      include: { gameDay: true },
    });
    if (!match) return false;

    const outcome = evaluateOutcome({
      score: { home: match.homeScore, away: match.awayScore },
      clock: clockOf(match),
      now,
      goalsToWin: match.gameDay.goalsToWin,
    });
    if (!outcome.finished || !outcome.result) return false;

    await finalizeMatch({
      matchId: match.id,
      actor: null,
      reason: outcome.reason ?? "TIME",
      result: outcome.result,
      now,
    });
    return true;
  });
}

export type MatchAction = "START" | "PAUSE" | "RESUME" | "END";

export async function changeMatchState(
  matchId: string,
  action: MatchAction,
  actor: CurrentUser,
): Promise<void> {
  const match = await loadMatch(matchId);
  if (match.gameDay.status === "FINISHED") {
    throw conflict("A pelada já foi encerrada.");
  }

  await withLock(`clock:${match.gameDayId}`, async () => {
    const now = Date.now();
    const clock = clockOf(match);

    if (action === "END") {
      const outcome = evaluateOutcome({
        score: { home: match.homeScore, away: match.awayScore },
        clock,
        now,
        goalsToWin: match.gameDay.goalsToWin,
      });
      await finalizeMatch({
        matchId,
        actor,
        reason: outcome.reason ?? "MANUAL",
        result: outcome.result ?? "DRAW",
        now,
      });
      return;
    }

    const next =
      action === "START"
        ? startClock(clock, now)
        : action === "PAUSE"
          ? pauseClock(clock, now)
          : resumeClock(clock, now);

    await prisma.match.update({
      where: { id: matchId },
      data: {
        status: next.status,
        remainingMs: next.remainingMs,
        lastResumedAt: next.lastResumedAt ? new Date(next.lastResumedAt) : null,
        startedAt: action === "START" ? new Date(now) : match.startedAt,
      },
    });

    if (action === "START" && match.gameDay.status !== "LIVE") {
      await prisma.gameDay.update({ where: { id: match.gameDayId }, data: { status: "LIVE" } });
    }

    const auditAction =
      action === "START"
        ? AUDIT_ACTIONS.MATCH_STARTED
        : action === "PAUSE"
          ? AUDIT_ACTIONS.MATCH_PAUSED
          : AUDIT_ACTIONS.MATCH_RESUMED;

    await recordAudit(actor, {
      action: auditAction,
      entity: "Match",
      entityId: matchId,
      summary: `Partida ${match.orderIndex}`,
      before: { status: match.status, remainingMs: match.remainingMs },
      after: { status: next.status, remainingMs: next.remainingMs },
    });
    publishGameDay(match.gameDayId, `match-${action.toLowerCase()}`);
  });
}

export type EventInput = { type: "GOAL" | "ASSIST"; userId: string; teamId: string };

export async function recordMatchEvent(
  matchId: string,
  input: EventInput,
  actor: CurrentUser,
): Promise<{ eventId: string }> {
  const match = await loadMatch(matchId);

  if (match.status === "FINISHED") throw conflict("A partida já foi encerrada.");
  if (match.status === "SCHEDULED") throw conflict("Inicie a partida antes de marcar.");
  if (input.teamId !== match.homeTeamId && input.teamId !== match.awayTeamId) {
    throw badRequest("Este time não está nesta partida.");
  }

  return withLock(`clock:${match.gameDayId}`, async () => {
    const now = Date.now();
    const side: Side = input.teamId === match.homeTeamId ? "HOME" : "AWAY";

    const belongs = await prisma.teamPlayer.findUnique({
      where: { teamId_userId: { teamId: input.teamId, userId: input.userId } },
    });
    if (!belongs) throw badRequest("Este jogador não está neste time.");

    const clock = clockOf(match);
    const elapsedMs = Math.max(0, match.durationMs - remainingAt(clock, now));

    const event = await prisma.matchEvent.create({
      data: {
        matchId,
        teamId: input.teamId,
        userId: input.userId,
        type: input.type,
        elapsedMs,
        createdById: actor.id,
      },
      include: { user: { select: { name: true } }, team: { select: { name: true } } },
    });

    let score = { home: match.homeScore, away: match.awayScore };
    if (input.type === "GOAL") {
      score = applyGoal(score, side);
      await prisma.match.update({
        where: { id: matchId },
        data: { homeScore: score.home, awayScore: score.away },
      });
    }

    await recordAudit(actor, {
      action: AUDIT_ACTIONS.MATCH_EVENT_CREATED,
      entity: "MatchEvent",
      entityId: event.id,
      summary: `${input.type === "GOAL" ? "Gol" : "Assistência"} de ${event.user.name} (time ${event.team.name})`,
      after: { matchId, type: input.type, userId: input.userId, teamId: input.teamId, elapsedMs },
    });

    const outcome = evaluateOutcome({
      score,
      clock,
      now,
      goalsToWin: match.gameDay.goalsToWin,
    });

    if (outcome.finished && outcome.result) {
      await finalizeMatch({
        matchId,
        actor,
        reason: outcome.reason ?? "GOALS",
        result: outcome.result,
        now,
      });
    } else {
      publishGameDay(match.gameDayId, "event-created");
    }

    return { eventId: event.id };
  });
}

/**
 * Desfaz um evento. Se o gol desfeito era o que encerrou a partida, a partida
 * volta para o jogo: o placar, a fila e a proxima partida sao revertidos.
 */
export async function undoMatchEvent(
  matchId: string,
  eventId: string,
  actor: CurrentUser,
): Promise<void> {
  const match = await loadMatch(matchId);

  await withLock(`clock:${match.gameDayId}`, async () => {
    const event = await prisma.matchEvent.findUnique({
      where: { id: eventId },
      include: { user: { select: { name: true } }, team: { select: { name: true } } },
    });
    if (!event || event.matchId !== matchId) throw notFound("Evento não encontrado.");
    if (match.gameDay.status === "FINISHED") throw conflict("A pelada já foi encerrada.");

    const undone = await prisma.$transaction(async (tx) => {
      await tx.matchEvent.delete({ where: { id: eventId } });

      const goals = await tx.matchEvent.groupBy({
        by: ["teamId"],
        where: { matchId, type: "GOAL" },
        _count: { _all: true },
      });
      const homeScore = goals.find((g) => g.teamId === match.homeTeamId)?._count._all ?? 0;
      const awayScore = goals.find((g) => g.teamId === match.awayTeamId)?._count._all ?? 0;

      const current = await tx.match.findUniqueOrThrow({ where: { id: matchId } });

      if (current.status !== "FINISHED") {
        await tx.match.update({ where: { id: matchId }, data: { homeScore, awayScore } });
        return { reopened: false, timeUp: false, homeScore, awayScore };
      }

      // O evento desfeito e de uma partida ja encerrada: desfaz tambem o giro da
      // fila e a proxima partida montada, e devolve a partida para o jogo.
      const snapshot = (current.queueSnapshot as unknown as QueueSnapshot | null) ?? [];
      const nextMatch = await tx.match.findFirst({
        where: { gameDayId: match.gameDayId, orderIndex: { gt: current.orderIndex } },
        orderBy: { orderIndex: "asc" },
      });
      if (nextMatch && nextMatch.status === "SCHEDULED") {
        await tx.match.delete({ where: { id: nextMatch.id } });
      }

      for (const team of snapshot) {
        await tx.team.update({ where: { id: team.id }, data: { queuePosition: team.queuePosition } });
      }

      await tx.match.update({
        where: { id: matchId },
        data: {
          homeScore,
          awayScore,
          status: "PAUSED",
          result: null,
          endReason: null,
          winnerTeamId: null,
          endedAt: null,
          queueSnapshot: Prisma.DbNull,
          lastResumedAt: null,
        },
      });
      return { reopened: true, timeUp: current.remainingMs <= 0, homeScore, awayScore };
    });

    // Partida que tinha acabado pelo tempo volta a acabar pelo tempo, agora com
    // o placar corrigido: quem sai de quadra pode mudar.
    if (undone.reopened && undone.timeUp) {
      const result: MatchResult =
        undone.homeScore > undone.awayScore
          ? "HOME"
          : undone.awayScore > undone.homeScore
            ? "AWAY"
            : "DRAW";
      await finalizeMatch({ matchId, actor, reason: "TIME", result, now: Date.now() });
    }

    await recordAudit(actor, {
      action: AUDIT_ACTIONS.MATCH_EVENT_UNDONE,
      entity: "MatchEvent",
      entityId: eventId,
      summary: `Desfeito: ${event.type === "GOAL" ? "gol" : "assistência"} de ${event.user.name} (time ${event.team.name})`,
      before: {
        matchId,
        type: event.type,
        userId: event.userId,
        teamId: event.teamId,
        elapsedMs: event.elapsedMs,
      },
      after: { reopenedMatch: undone.reopened, homeScore: undone.homeScore, awayScore: undone.awayScore },
    });
    publishGameDay(match.gameDayId, "event-undone");
  });
}
