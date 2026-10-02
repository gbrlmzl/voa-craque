import { Prisma } from "@/generated/prisma/client";
import type { Match, MatchEndReason } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, conflict, notFound } from "@/lib/http";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { publishGameDay, withLock } from "@/lib/realtime";
import type { CurrentUser } from "@/lib/session";
import {
  applyGoal,
  elapsedAt,
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
import {
  averageStrength,
  buildBench,
  evaluateSubstitution,
  planLineupChange,
  planUndo,
  swapRoster,
  type SubstitutionInput,
  type SubstitutionPlan,
  type SubstitutionView,
  type TeamRoster,
} from "@/lib/substitution";
import { ratePlayers } from "@/lib/team-balancer";
import { loadPool } from "@/services/teams";

type Tx = Prisma.TransactionClient;
type QueueSnapshot = { id: string; queuePosition: number | null }[];

/** Linhas de TeamPlayer e GameDayReserve afetadas por uma troca permanente, antes dela. */
type RosterBefore = {
  teamPlayers: { teamId: string; userId: string; isKeeper: boolean; strength: number; createdAt: string }[];
  reserves: { userId: string; createdAt: string }[];
  averageStrength: { teamId: string; value: number }[];
};

const NAME_SELECT = {
  select: { username: true, profile: { select: { name: true, nickname: true } } },
} as const;

/** Mesmo nome que o painel mostra no card do jogador. */
function playerLabel(user: {
  username: string;
  profile: { name: string; nickname: string | null } | null;
}): string {
  return user.profile?.nickname || user.profile?.name || user.username;
}

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

  const match = await tx.match.create({
    data: {
      gameDayId: gameDay.id,
      orderIndex: (previous._max.orderIndex ?? 0) + 1,
      homeTeamId,
      awayTeamId,
      durationMs,
      remainingMs: durationMs,
    },
  });

  // Escalacao inicial: copia o elenco fixo dos dois times. O mandante vai
  // primeiro para que, se algum dado antigo repetir o jogador nos dois times,
  // o unique (partida, jogador) nao derrube a criacao da partida.
  const roster = await tx.teamPlayer.findMany({
    where: { teamId: { in: [homeTeamId, awayTeamId] } },
    select: { teamId: true, userId: true, isKeeper: true },
  });
  roster.sort((a, b) => Number(b.teamId === homeTeamId) - Number(a.teamId === homeTeamId));
  await tx.matchPlayer.createMany({
    data: roster.map((player) => ({
      matchId: match.id,
      teamId: player.teamId,
      userId: player.userId,
      isKeeper: player.isKeeper,
      starter: true,
      onCourt: true,
    })),
    skipDuplicates: true,
  });

  return match;
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

    // Vale a escalacao da partida, nao o elenco fixo: o substituto marca. Nao
    // exige onCourt, para aceitar o gol anotado com atraso de quem ja saiu.
    const belongs = await prisma.matchPlayer.findUnique({
      where: { matchId_userId: { matchId, userId: input.userId } },
    });
    if (!belongs || belongs.teamId !== input.teamId) {
      throw badRequest("Este jogador não está neste time.");
    }

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
      include: { user: { select: { username: true, profile: { select: { name: true } } } }, team: { select: { name: true } } },
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
      summary: `${input.type === "GOAL" ? "Gol" : "Assistência"} de ${event.user.profile?.name ?? event.user.username} (time ${event.team.name})`,
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
      include: { user: { select: { username: true, profile: { select: { name: true } } } }, team: { select: { name: true } } },
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
        await deleteScheduledMatch(tx, match.gameDayId, nextMatch.id);
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
      summary: `Desfeito: ${event.type === "GOAL" ? "gol" : "assistência"} de ${event.user.profile?.name ?? event.user.username} (time ${event.team.name})`,
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

async function restoreRoster(
  tx: Tx,
  gameDayId: string,
  substitution: {
    teamId: string;
    outUserId: string;
    inUserId: string;
    fromTeamId: string | null;
    rosterBefore: Prisma.JsonValue;
  },
): Promise<void> {
  const before = substitution.rosterBefore as unknown as RosterBefore | null;
  if (!before) return;

  // Apaga o que a troca criou e devolve as linhas como estavam, com a data original.
  await tx.teamPlayer.deleteMany({
    where: {
      OR: [
        { teamId: substitution.teamId, userId: substitution.inUserId },
        ...(substitution.fromTeamId
          ? [{ teamId: substitution.fromTeamId, userId: substitution.outUserId }]
          : []),
      ],
    },
  });
  if (!substitution.fromTeamId) {
    await tx.gameDayReserve.deleteMany({ where: { gameDayId, userId: substitution.outUserId } });
  }

  if (before.teamPlayers.length > 0) {
    await tx.teamPlayer.createMany({
      data: before.teamPlayers.map((row) => ({ ...row, createdAt: new Date(row.createdAt) })),
    });
  }
  if (before.reserves.length > 0) {
    await tx.gameDayReserve.createMany({
      data: before.reserves.map((row) => ({
        gameDayId,
        userId: row.userId,
        createdAt: new Date(row.createdAt),
      })),
    });
  }
  for (const entry of before.averageStrength) {
    await tx.team.update({ where: { id: entry.teamId }, data: { averageStrength: entry.value } });
  }
}

/**
 * Apaga uma partida que ainda nao comecou. Troca permanente feita nela nunca
 * valeu em jogo nenhum, entao o elenco volta ao que era antes de apagar.
 */
export async function deleteScheduledMatch(tx: Tx, gameDayId: string, matchId: string): Promise<void> {
  const permanent = await tx.matchSubstitution.findMany({
    where: { matchId, permanent: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  for (const substitution of permanent) {
    await restoreRoster(tx, gameDayId, substitution);
  }
  await tx.match.delete({ where: { id: matchId } });
}

async function loadSubstitutionState(
  tx: Tx,
  match: { id: string; gameDayId: string; homeTeamId: string; awayTeamId: string },
) {
  const lineup = await tx.matchPlayer.findMany({ where: { matchId: match.id } });
  const teams = await tx.team.findMany({
    where: { gameDayId: match.gameDayId },
    include: { players: true },
  });
  const reserves = await tx.gameDayReserve.findMany({ where: { gameDayId: match.gameDayId } });

  const rosters = teams.map((team) => ({
    teamId: team.id,
    queuePosition: team.queuePosition,
    userIds: team.players.map((player) => player.userId),
  }));
  const rosterOf = (teamId: string) => rosters.find((roster) => roster.teamId === teamId)?.userIds ?? [];

  const view: SubstitutionView = {
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    court: lineup.filter((row) => row.onCourt).map((row) => ({ userId: row.userId, teamId: row.teamId })),
    bench: buildBench({
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      lineup,
      rosters,
      reserveIds: reserves.map((reserve) => reserve.userId),
    }),
    rosters: {
      [match.homeTeamId]: rosterOf(match.homeTeamId),
      [match.awayTeamId]: rosterOf(match.awayTeamId),
    },
  };
  return { view, lineup, teams, reserves };
}

type TeamWithPlayers = Prisma.TeamGetPayload<{ include: { players: true } }>;

const toRoster = (team: TeamWithPlayers): TeamRoster => ({
  teamId: team.id,
  players: team.players.map((player) => ({
    userId: player.userId,
    isKeeper: player.isKeeper,
    strength: player.strength,
  })),
});

/** Troca os dois de lugar no elenco fixo e devolve o que havia antes, para o desfazer. */
async function applyPermanentSwap(
  tx: Tx,
  gameDayId: string,
  plan: SubstitutionPlan,
  teams: TeamWithPlayers[],
  reserves: { userId: string; createdAt: Date }[],
  inStrengthFromPool: number | null,
): Promise<RosterBefore> {
  const team = teams.find((candidate) => candidate.id === plan.teamId);
  if (!team) throw notFound("Time não encontrado.");
  const origin = plan.fromTeamId
    ? (teams.find((candidate) => candidate.id === plan.fromTeamId) ?? null)
    : null;

  if (!origin && inStrengthFromPool === null) {
    throw badRequest("Quem entra não está mais inscrito na pelada.");
  }

  const swap = swapRoster({
    team: toRoster(team),
    origin: origin ? toRoster(origin) : null,
    reserveIds: reserves.map((reserve) => reserve.userId),
    outUserId: plan.outUserId,
    inUserId: plan.inUserId,
    inStrength: inStrengthFromPool,
  });

  const outRow = team.players.find((player) => player.userId === plan.outUserId);
  const inRow = origin?.players.find((player) => player.userId === plan.inUserId);
  const inReserve = origin ? null : reserves.find((reserve) => reserve.userId === plan.inUserId);

  const before: RosterBefore = {
    teamPlayers: [outRow, inRow]
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .map((row) => ({
        teamId: row.teamId,
        userId: row.userId,
        isKeeper: row.isKeeper,
        strength: row.strength,
        createdAt: row.createdAt.toISOString(),
      })),
    reserves: inReserve ? [{ userId: inReserve.userId, createdAt: inReserve.createdAt.toISOString() }] : [],
    averageStrength: [
      { teamId: team.id, value: team.averageStrength },
      ...(origin ? [{ teamId: origin.id, value: origin.averageStrength }] : []),
    ],
  };

  await tx.teamPlayer.deleteMany({
    where: {
      OR: [
        { teamId: team.id, userId: plan.outUserId },
        ...(origin ? [{ teamId: origin.id, userId: plan.inUserId }] : []),
      ],
    },
  });

  const entering = swap.team.players.find((player) => player.userId === plan.inUserId)!;
  await tx.teamPlayer.create({ data: { teamId: team.id, ...entering } });
  await tx.team.update({
    where: { id: team.id },
    data: { averageStrength: averageStrength(swap.team.players) },
  });

  if (origin && swap.origin) {
    const leaving = swap.origin.players.find((player) => player.userId === plan.outUserId)!;
    await tx.teamPlayer.create({ data: { teamId: origin.id, ...leaving } });
    await tx.team.update({
      where: { id: origin.id },
      data: { averageStrength: averageStrength(swap.origin.players) },
    });
  } else {
    await tx.gameDayReserve.deleteMany({ where: { gameDayId, userId: plan.inUserId } });
    await tx.gameDayReserve.create({ data: { gameDayId, userId: plan.outUserId } });
  }

  return before;
}

/**
 * Substituicao em quadra. A partida nao pausa: no futsal a troca e volante. O
 * tempo decorrido sai do relogio do servidor no momento da confirmacao.
 */
export async function recordSubstitution(
  matchId: string,
  input: SubstitutionInput,
  actor: CurrentUser,
): Promise<{ substitutionId: string }> {
  const initial = await loadMatch(matchId);

  return withLock(`clock:${initial.gameDayId}`, async () => {
    const now = Date.now();

    const poolStrength = input.permanent
      ? new Map(ratePlayers(await loadPool(initial.gameDayId)).rated.map((p) => [p.userId, p.strength]))
      : null;

    // Tudo e relido dentro da transacao: quem sai e quem entra precisam ser
    // conferidos com o estado de agora, nao com o de antes de esperar a vez no lock.
    const created = await prisma.$transaction(async (tx) => {
      const match = await tx.match.findUnique({ where: { id: matchId }, include: { gameDay: true } });
      if (!match) throw notFound("Partida não encontrada.");
      if (match.status === "FINISHED") throw conflict("A partida já foi encerrada.");
      if (match.gameDay.status === "FINISHED") throw conflict("A pelada já foi encerrada.");

      const { view, lineup, teams, reserves } = await loadSubstitutionState(tx, match);
      const result = evaluateSubstitution(view, input);
      if (!result.ok) throw badRequest(result.error);
      const { plan } = result;

      const change = planLineupChange(lineup, plan);
      await tx.matchPlayer.updateMany({
        where: { matchId, userId: change.deactivate },
        data: { onCourt: false },
      });
      if (change.activate.kind === "reactivate") {
        await tx.matchPlayer.updateMany({
          where: { matchId, userId: change.activate.userId },
          data: { onCourt: true },
        });
      } else {
        await tx.matchPlayer.create({ data: { matchId, ...change.activate.row } });
      }

      const rosterBefore = plan.permanent
        ? await applyPermanentSwap(
            tx,
            match.gameDayId,
            plan,
            teams,
            reserves,
            poolStrength?.get(plan.inUserId) ?? null,
          )
        : null;

      const substitution = await tx.matchSubstitution.create({
        data: {
          matchId,
          teamId: plan.teamId,
          outUserId: plan.outUserId,
          inUserId: plan.inUserId,
          fromTeamId: plan.fromTeamId,
          permanent: plan.permanent,
          elapsedMs: elapsedAt(clockOf(match), now),
          rosterBefore: rosterBefore ? (rosterBefore as unknown as Prisma.InputJsonValue) : undefined,
          createdById: actor.id,
        },
        include: {
          team: { select: { name: true } },
          outUser: NAME_SELECT,
          inUser: NAME_SELECT,
        },
      });
      return { substitution, gameDayId: match.gameDayId, orderIndex: match.orderIndex };
    });

    const { substitution } = created;
    await recordAudit(actor, {
      action: AUDIT_ACTIONS.MATCH_SUBSTITUTION,
      entity: "MatchSubstitution",
      entityId: substitution.id,
      summary: `Partida ${created.orderIndex}: entra ${playerLabel(substitution.inUser)}, sai ${playerLabel(substitution.outUser)} (time ${substitution.team.name})`,
      after: {
        matchId,
        teamId: substitution.teamId,
        outUserId: substitution.outUserId,
        inUserId: substitution.inUserId,
        fromTeamId: substitution.fromTeamId,
        permanent: substitution.permanent,
        elapsedMs: substitution.elapsedMs,
      },
    });
    publishGameDay(created.gameDayId, "substitution");

    return { substitutionId: substitution.id };
  });
}

type SubstitutionRow = {
  id: string;
  teamId: string;
  outUserId: string;
  inUserId: string;
  createdAt: Date;
};

const summarize = (row: SubstitutionRow) => ({
  id: row.id,
  teamId: row.teamId,
  outUserId: row.outUserId,
  inUserId: row.inUserId,
  createdAt: row.createdAt.getTime(),
});

/**
 * Desfaz a troca mais recente da partida, desde que quem entrou ainda nao tenha
 * gol nem assistencia depois dela.
 */
export async function undoSubstitution(
  matchId: string,
  substitutionId: string,
  actor: CurrentUser,
): Promise<void> {
  const initial = await loadMatch(matchId);

  await withLock(`clock:${initial.gameDayId}`, async () => {
    const undone = await prisma.$transaction(async (tx) => {
      const match = await tx.match.findUnique({ where: { id: matchId }, include: { gameDay: true } });
      if (!match) throw notFound("Partida não encontrada.");

      const substitution = await tx.matchSubstitution.findUnique({
        where: { id: substitutionId },
        include: { team: { select: { name: true } }, outUser: NAME_SELECT, inUser: NAME_SELECT },
      });
      if (!substitution || substitution.matchId !== matchId) {
        throw notFound("Substituição não encontrada.");
      }
      if (match.status === "FINISHED") throw conflict("A partida já foi encerrada.");
      if (match.gameDay.status === "FINISHED") throw conflict("A pelada já foi encerrada.");

      const all = await tx.matchSubstitution.findMany({ where: { matchId } });
      const lineup = await tx.matchPlayer.findMany({ where: { matchId } });
      const events = await tx.matchEvent.findMany({
        where: { matchId, userId: substitution.inUserId },
        select: { userId: true, createdAt: true },
      });

      const plan = planUndo({
        target: summarize(substitution),
        substitutions: all.map(summarize),
        lineup,
        events: events.map((event) => ({ userId: event.userId, createdAt: event.createdAt.getTime() })),
      });
      if (plan.kind === "NOT_LATEST") {
        throw conflict("Só dá para desfazer a última substituição da partida.");
      }
      if (plan.kind === "BLOCKED") {
        throw conflict(`Desfaça antes o lance de ${playerLabel(substitution.inUser)}.`);
      }

      await tx.matchPlayer.updateMany({
        where: { matchId, userId: substitution.outUserId },
        data: { onCourt: true },
      });
      if (plan.inFate === "DELETE") {
        await tx.matchPlayer.deleteMany({ where: { matchId, userId: substitution.inUserId } });
      } else {
        await tx.matchPlayer.updateMany({
          where: { matchId, userId: substitution.inUserId },
          data: { onCourt: false },
        });
      }

      if (substitution.permanent) {
        await restoreRoster(tx, match.gameDayId, substitution);
      }
      await tx.matchSubstitution.delete({ where: { id: substitutionId } });

      return { substitution, gameDayId: match.gameDayId, orderIndex: match.orderIndex };
    });

    const { substitution } = undone;
    await recordAudit(actor, {
      action: AUDIT_ACTIONS.MATCH_SUBSTITUTION_UNDONE,
      entity: "MatchSubstitution",
      entityId: substitutionId,
      summary: `Partida ${undone.orderIndex}, desfeito: entrada de ${playerLabel(substitution.inUser)}, saída de ${playerLabel(substitution.outUser)} (time ${substitution.team.name})`,
      before: {
        matchId,
        teamId: substitution.teamId,
        outUserId: substitution.outUserId,
        inUserId: substitution.inUserId,
        fromTeamId: substitution.fromTeamId,
        permanent: substitution.permanent,
        elapsedMs: substitution.elapsedMs,
      },
    });
    publishGameDay(undone.gameDayId, "substitution-undone");
  });
}
