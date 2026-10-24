import { prisma } from "@/lib/prisma";
import { nightPerformance } from "@/lib/mmr";

export type GameDayPlayerStats = {
  userId: string;
  name: string;
  nickname: string | null;
  photoUrl: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  winRate: number;
  goals: number;
  assists: number;
  topScorer: boolean;
  /** Melhor desempenho da pelada antes do fator de aposta (D25). Qualquer um ve o selo; so o organizador ve o numero. */
  mvp: boolean;
  mmrDelta: number | null;
};

/**
 * Estatisticas de uma pelada especifica, so entre quem se inscreveu e jogou de
 * verdade: quem tem linha na escalacao de uma partida encerrada, seja titular
 * ou substituto. "Artilheiro" aqui e sempre relativo a essa pelada, nunca ao
 * acumulado geral do ranking.
 */
export async function buildGameDayStats(
  gameDayId: string,
  options: { canSeeMmr: boolean },
): Promise<GameDayPlayerStats[]> {
  const [registrations, lineups, events, changes] = await Promise.all([
    prisma.registration.findMany({
      where: { gameDayId },
      select: {
        userId: true,
        user: {
          select: { username: true, profile: { select: { name: true, nickname: true, photoUrl: true } } },
        },
      },
    }),
    prisma.matchPlayer.findMany({
      where: { match: { gameDayId, status: "FINISHED" } },
      select: { userId: true, teamId: true, match: { select: { result: true, homeTeamId: true } } },
    }),
    prisma.matchEvent.groupBy({
      by: ["userId", "type"],
      where: { match: { gameDayId, status: "FINISHED" } },
      _count: { _all: true },
    }),
    prisma.ratingChange.findMany({
      where: { gameDayId },
      select: {
        userId: true,
        delta: true,
        resultDelta: true,
        attackDelta: true,
        defenseDelta: true,
        normalizeDelta: true,
      },
    }),
  ]);

  const rows = new Map<string, GameDayPlayerStats>();
  for (const registration of registrations) {
    rows.set(registration.userId, {
      userId: registration.userId,
      name: registration.user.profile?.name ?? registration.user.username,
      nickname: registration.user.profile?.nickname ?? null,
      photoUrl: registration.user.profile?.photoUrl ?? null,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      winRate: 0,
      goals: 0,
      assists: 0,
      topScorer: false,
      mvp: false,
      mmrDelta: null,
    });
  }

  // Quem jogou pelo time recebe o jogo e o resultado do lado desse time, tenha
  // comecado a partida ou entrado depois.
  for (const { userId, teamId, match } of lineups) {
    const row = rows.get(userId);
    if (!row) continue;
    const side = teamId === match.homeTeamId ? "HOME" : "AWAY";
    row.played += 1;
    if (match.result === "DRAW") row.drawn += 1;
    else if (match.result === side) row.won += 1;
    else if (match.result) row.lost += 1;
  }

  for (const entry of events) {
    const row = rows.get(entry.userId);
    if (!row) continue;
    if (entry.type === "GOAL") row.goals += entry._count._all;
    else row.assists += entry._count._all;
  }

  let maxGoals = 0;
  for (const row of rows.values()) {
    row.winRate = row.played > 0 ? row.won / row.played : 0;
    if (row.goals > maxGoals) maxGoals = row.goals;
  }
  if (maxGoals > 0) {
    for (const row of rows.values()) {
      row.topScorer = row.goals === maxGoals;
    }
  }

  // MVP: melhor desempenho positivo da noite antes do fator de aposta, senao quem tem mais
  // estrelas levaria o selo; no empate, o userId menor (mesma regra do calculo).
  let best: { userId: string; performance: number } | null = null;
  for (const change of changes) {
    if (options.canSeeMmr) {
      const row = rows.get(change.userId);
      if (row) row.mmrDelta = change.delta;
    }
    const performance = nightPerformance(change);
    if (performance <= 0) continue;
    if (
      !best ||
      performance > best.performance ||
      (performance === best.performance && change.userId < best.userId)
    ) {
      best = { userId: change.userId, performance };
    }
  }
  if (best) {
    const row = rows.get(best.userId);
    if (row) row.mvp = true;
  }

  return [...rows.values()].filter((row) => row.played > 0);
}
