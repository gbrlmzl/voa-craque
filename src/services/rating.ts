import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/http";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/session";
import { formatMmrDelta } from "@/lib/labels";
import { MMR, rateGameDay, type MmrGameDayResult, type MmrMatch, type MmrPlayer } from "@/lib/mmr";

type Tx = Prisma.TransactionClient;

/**
 * Estrela que valeu para cada jogador em cada pelada (gameDayId -> userId ->
 * estrela, nula se nao havia). A recomputacao reaproveita o que o extrato guardou
 * para que mudar a estrela de alguem hoje nao reescreva o que ele ganhou ou perdeu
 * no passado.
 */
type StarsHistory = Map<string, Map<string, number | null>>;

export type RatingOutcome = {
  /** Motivo de a pelada nao contar, ou null. */
  skipped: string | null;
  /** Ja tinha sido contabilizada: nada foi gravado agora. */
  alreadyApplied: boolean;
  players: number;
  summary: string;
  after: unknown;
};

function playerLabel(user: {
  username: string;
  profile: { name: string; nickname: string | null } | null;
}): string {
  return user.profile?.nickname || user.profile?.name || user.username;
}

/**
 * Monta a entrada do modulo puro a partir do banco, com o MMR de ANTES da pelada.
 * Quem nunca jogou entra no centro da escala, qualquer que seja a estrela dele; a
 * estrela do perfil entra so como esperado e como fator de aposta, e e a de agora,
 * a menos que a recomputacao ja tenha guardado a que valia naquela pelada.
 * Nao grava nada: o PlayerRating de quem estreia nasce em `applyGameDayRatings`.
 */
async function loadGameDayInput(
  tx: Tx,
  gameDayId: string,
  starsHistory?: StarsHistory,
): Promise<{ players: MmrPlayer[]; matches: MmrMatch[] }> {
  const rows = await tx.match.findMany({
    where: { gameDayId, status: "FINISHED" },
    orderBy: { orderIndex: "asc" },
    select: {
      id: true,
      orderIndex: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      result: true,
      lineup: { select: { userId: true, teamId: true } },
      events: { select: { userId: true, teamId: true, type: true } },
    },
  });

  const matches = rows.map<MmrMatch>((row) => ({
    matchId: row.id,
    orderIndex: row.orderIndex,
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    result: row.result,
    lineup: row.lineup,
    events: row.events,
  }));

  const userIds = [...new Set(rows.flatMap((row) => row.lineup.map((entry) => entry.userId)))];
  if (userIds.length === 0) return { players: [], matches };

  const [ratings, profiles] = await Promise.all([
    tx.playerRating.findMany({ where: { userId: { in: userIds } } }),
    tx.playerProfile.findMany({ where: { userId: { in: userIds } }, select: { userId: true, stars: true } }),
  ]);
  const ratingByUser = new Map(ratings.map((rating) => [rating.userId, rating]));
  const starsByUser = new Map(profiles.map((profile) => [profile.userId, profile.stars]));
  const recorded = starsHistory?.get(gameDayId);

  const players = userIds.map<MmrPlayer>((userId) => {
    const rating = ratingByUser.get(userId);
    return {
      userId,
      mmr: rating?.mmr ?? MMR.BASE,
      stars: recorded?.has(userId) ? (recorded.get(userId) ?? null) : (starsByUser.get(userId) ?? null),
      gameDaysRated: rating?.gameDaysRated ?? 0,
    };
  });
  return { players, matches };
}

async function describeExtremes(tx: Tx, result: MmrGameDayResult): Promise<string> {
  const count = result.players.length;
  const sorted = [...result.players].sort((a, b) => b.delta - a.delta);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const users = await tx.user.findMany({
    where: { id: { in: [best.userId, worst.userId] } },
    select: { id: true, username: true, profile: { select: { name: true, nickname: true } } },
  });
  const nameOf = (userId: string) => {
    const user = users.find((entry) => entry.id === userId);
    return user ? playerLabel(user) : "—";
  };
  return `${count} jogadores, maior alta ${formatMmrDelta(best.delta)} (${nameOf(best.userId)}), maior baixa ${formatMmrDelta(worst.delta)} (${nameOf(worst.userId)})`;
}

/**
 * Aplica o MMR de uma pelada. Idempotente: se a pelada ja foi contabilizada
 * (`ratedAt`), devolve sem fazer nada; o unico (gameDayId, userId) de
 * RatingChange e a trava real contra uma corrida.
 *
 * Nao audita: quem chama grava a auditoria depois do commit (ver
 * `auditRatingOutcome`), para nao registrar um MMR de uma transacao desfeita.
 */
export async function applyGameDayRatings(
  tx: Tx,
  gameDayId: string,
  starsHistory?: StarsHistory,
): Promise<RatingOutcome> {
  const gameDay = await tx.gameDay.findUnique({
    where: { id: gameDayId },
    select: { id: true, ratedAt: true, finishedAt: true },
  });
  if (!gameDay) throw notFound("Pelada não encontrada.");
  if (gameDay.ratedAt) {
    return { skipped: null, alreadyApplied: true, players: 0, summary: "", after: null };
  }

  const now = new Date();
  // No historico o extrato fica na data da pelada, para a ordem do extrato valer na recomputacao.
  const ratedOn = gameDay.finishedAt ?? now;

  const input = await loadGameDayInput(tx, gameDayId, starsHistory);
  const result = rateGameDay(input);

  if (result.skipped) {
    await tx.gameDay.update({
      where: { id: gameDayId },
      data: { ratedAt: now, ratingSkippedReason: result.skipped },
    });
    return { skipped: result.skipped, alreadyApplied: false, players: 0, summary: result.skipped, after: null };
  }

  await tx.ratingChange.createMany({
    data: result.players.map((player) => ({
      gameDayId,
      userId: player.userId,
      mmrBefore: player.mmrBefore,
      mmrAfter: player.mmrAfter,
      delta: player.delta,
      resultDelta: player.resultDelta,
      attackDelta: player.attackDelta,
      defenseDelta: player.defenseDelta,
      normalizeDelta: player.normalizeDelta,
      stakeFactor: player.stakeFactor,
      calibrationFactor: player.calibrationFactor,
      capped: player.capped,
      starsUsed: player.starsUsed,
      matches: player.matches,
      goals: player.goals,
      assists: player.assists,
      won: player.won,
      drawn: player.drawn,
      lost: player.lost,
      conceded: player.conceded,
      cleanSheets: player.cleanSheets,
      perMatch: player.perMatch as unknown as Prisma.InputJsonValue,
      createdAt: ratedOn,
    })),
  });

  const current = await tx.playerRating.findMany({
    where: { userId: { in: result.players.map((player) => player.userId) } },
    select: { userId: true, peakMmr: true, lowestMmr: true },
  });
  const currentByUser = new Map(current.map((rating) => [rating.userId, rating]));

  for (const player of result.players) {
    const rating = currentByUser.get(player.userId);
    const peakMmr = Math.max(rating?.peakMmr ?? player.mmrBefore, player.mmrAfter);
    const lowestMmr = Math.min(rating?.lowestMmr ?? player.mmrBefore, player.mmrAfter);
    await tx.playerRating.upsert({
      where: { userId: player.userId },
      create: {
        userId: player.userId,
        mmr: player.mmrAfter,
        peakMmr,
        lowestMmr,
        gameDaysRated: 1,
        matchesRated: player.matches,
        lastDelta: player.delta,
        lastGameDayId: gameDayId,
        lastRatedAt: ratedOn,
      },
      update: {
        mmr: player.mmrAfter,
        peakMmr,
        lowestMmr,
        gameDaysRated: { increment: 1 },
        matchesRated: { increment: player.matches },
        lastDelta: player.delta,
        lastGameDayId: gameDayId,
        lastRatedAt: ratedOn,
      },
    });
  }

  await tx.gameDay.update({
    where: { id: gameDayId },
    data: { ratedAt: now, ratingSkippedReason: null },
  });

  return {
    skipped: null,
    alreadyApplied: false,
    players: result.players.length,
    summary: await describeExtremes(tx, result),
    after: result.players.map((player) => ({
      userId: player.userId,
      delta: player.delta,
      mmrAfter: player.mmrAfter,
    })),
  };
}

/** Uma linha de auditoria por pelada, e nao uma por jogador: vinte linhas afogariam /admin/audit. */
export async function auditRatingOutcome(
  actor: CurrentUser | null,
  gameDay: { id: string; title: string },
  outcome: RatingOutcome,
): Promise<void> {
  if (outcome.alreadyApplied) return;
  if (outcome.skipped) {
    await recordAudit(actor, {
      action: AUDIT_ACTIONS.RATING_SKIPPED,
      entity: "GameDay",
      entityId: gameDay.id,
      summary: `${gameDay.title}: ${outcome.skipped}`,
      after: { reason: outcome.skipped },
    });
    return;
  }
  await recordAudit(actor, {
    action: AUDIT_ACTIONS.RATING_APPLIED,
    entity: "GameDay",
    entityId: gameDay.id,
    summary: `${gameDay.title}: ${outcome.summary}`,
    after: outcome.after,
  });
}

/**
 * Apaga RatingChange e PlayerRating e replica todas as peladas encerradas em
 * ordem. Reaproveita a estrela que o extrato tinha guardado em cada pelada, para a
 * historia nao mudar so porque o organizador reavaliou o jogador depois. Um ajuste
 * manual de MMR (adjustMmr) e apagado por aqui.
 */
export async function recomputeAllRatings(
  actor: CurrentUser | null,
  log?: (message: string) => void,
): Promise<{ gameDays: number; players: number }> {
  const result = await prisma.$transaction(
    async (tx) => {
      const starsHistory: StarsHistory = new Map();
      for (const change of await tx.ratingChange.findMany({
        select: { gameDayId: true, userId: true, starsUsed: true },
      })) {
        const byUser = starsHistory.get(change.gameDayId) ?? new Map<string, number | null>();
        byUser.set(change.userId, change.starsUsed);
        starsHistory.set(change.gameDayId, byUser);
      }

      await tx.ratingChange.deleteMany({});
      await tx.playerRating.deleteMany({});
      await tx.gameDay.updateMany({ data: { ratedAt: null, ratingSkippedReason: null } });

      const gameDays = await tx.gameDay.findMany({
        where: { status: "FINISHED" },
        select: { id: true, title: true, finishedAt: true, scheduledAt: true },
      });
      gameDays.sort(
        (a, b) =>
          (a.finishedAt ?? a.scheduledAt).getTime() - (b.finishedAt ?? b.scheduledAt).getTime() ||
          a.id.localeCompare(b.id),
      );

      for (const gameDay of gameDays) {
        const outcome = await applyGameDayRatings(tx, gameDay.id, starsHistory);
        log?.(
          outcome.skipped
            ? `${gameDay.title}: não contou (${outcome.skipped})`
            : `${gameDay.title}: ${outcome.summary}`,
        );
      }

      const players = await tx.playerRating.count();
      return { gameDays: gameDays.length, players };
    },
    { timeout: 10 * 60_000, maxWait: 30_000 },
  );

  await recordAudit(actor, {
    action: AUDIT_ACTIONS.RATING_RECOMPUTED,
    entity: "PlayerRating",
    summary: `MMR recomputado: ${result.gameDays} peladas, ${result.players} jogadores`,
    after: result,
  });
  return result;
}

// ------------------------------------------------------------ ajuste manual

/** Escotilha de emergencia: o superadmin corrige um MMR na mao, com motivo e auditoria. */
export async function adjustMmr(userId: string, mmr: number, reason: string, actor: CurrentUser): Promise<void> {
  const rating = await prisma.playerRating.findUnique({
    where: { userId },
    select: {
      mmr: true,
      peakMmr: true,
      lowestMmr: true,
      user: { select: { username: true, profile: { select: { name: true, nickname: true } } } },
    },
  });
  if (!rating) throw notFound("Este jogador ainda não tem MMR.");

  const next = Math.round(mmr * 10) / 10;
  await prisma.playerRating.update({
    where: { userId },
    data: {
      mmr: next,
      peakMmr: Math.max(rating.peakMmr, next),
      lowestMmr: Math.min(rating.lowestMmr, next),
    },
  });

  await recordAudit(actor, {
    action: AUDIT_ACTIONS.RATING_ADJUSTED,
    entity: "PlayerRating",
    entityId: userId,
    summary: `MMR de ${playerLabel(rating.user)}: ${rating.mmr} → ${next}`,
    before: { mmr: rating.mmr },
    after: { mmr: next, reason },
  });
}
