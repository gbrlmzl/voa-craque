import type { Position } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type RankingRow = {
  userId: string;
  name: string;
  nickname: string | null;
  photoUrl: string | null;
  position: Position | null;
  stars: number | null;
  goals: number;
  assists: number;
  participations: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  winRate: number;
  goalsPerMatch: number;
  gameDays: number;
  /** MMR: o placar do ranking geral, aberto a todos; nulo para quem ainda nao jogou. */
  mmr: number | null;
  /** Posicao no ranking geral; nula para quem ainda nao tem MMR. */
  mmrRank: number | null;
  /** Movimento de posicao causado pela ultima pelada contabilizada, para todos. */
  mmrTrend: "up" | "down" | "flat" | null;
  /** Quantas posicoes subiu (positivo) ou caiu (negativo) na ultima pelada. */
  mmrRankChange: number | null;
  /** Pontos que o MMR andou na ultima pelada: so o organizador. */
  mmrDelta: number | null;
};

/** Ordem do ranking geral: MMR do maior para o menor; empate no numero desempata pelo nome. */
function compareMmr(a: { mmr: number; name: string }, b: { mmr: number; name: string }): number {
  return b.mmr - a.mmr || a.name.localeCompare(b.name, "pt-BR");
}

/**
 * Posicao de cada jogador no ranking geral, a mesma que a tabela de /ranking mostra.
 * Quem nao esta no mapa nao esta no ranking (inativo, sem perfil completo ou sem MMR).
 */
export async function mmrRanks(): Promise<Map<string, number>> {
  const ratings = await prisma.playerRating.findMany({
    where: { user: { active: true, profile: { completed: true } } },
    select: { userId: true, mmr: true, user: { select: { username: true, profile: { select: { name: true } } } } },
  });
  const ranked = ratings
    .map((rating) => ({ userId: rating.userId, mmr: rating.mmr, name: rating.user.profile?.name ?? rating.user.username }))
    .sort(compareMmr);
  return new Map(ranked.map((entry, index) => [entry.userId, index + 1]));
}

export async function mmrRankOf(userId: string): Promise<number | null> {
  return (await mmrRanks()).get(userId) ?? null;
}

/**
 * Ranking a partir das partidas ja encerradas. Partida em andamento so entra na
 * conta depois que acaba, igual ao que o painel ao vivo mostra.
 */
export async function buildRanking(options: { showMmrDelta: boolean }): Promise<RankingRow[]> {
  const [players, lineups, events, ratings, lastRatedGameDay] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, profile: { completed: true } },
      select: {
        id: true,
        username: true,
        profile: { select: { name: true, nickname: true, photoUrl: true, position: true, stars: true } },
      },
    }),
    prisma.matchPlayer.findMany({
      where: { match: { status: "FINISHED" } },
      select: {
        userId: true,
        teamId: true,
        match: { select: { gameDayId: true, result: true, homeTeamId: true } },
      },
    }),
    prisma.matchEvent.groupBy({
      by: ["userId", "type"],
      where: { match: { status: "FINISHED" } },
      _count: { _all: true },
    }),
    prisma.playerRating.findMany({ select: { userId: true, mmr: true, lastDelta: true } }),
    // A ultima pelada contabilizada: o MMR de antes dela diz onde cada um estava no ranking.
    prisma.gameDay.findFirst({
      where: { ratingChanges: { some: {} } },
      orderBy: [{ finishedAt: "desc" }, { scheduledAt: "desc" }, { id: "desc" }],
      select: { ratingChanges: { select: { userId: true, mmrBefore: true } } },
    }),
  ]);

  const rows = new Map<string, RankingRow>();
  for (const player of players) {
    rows.set(player.id, {
      userId: player.id,
      name: player.profile?.name ?? player.username,
      nickname: player.profile?.nickname ?? null,
      photoUrl: player.profile?.photoUrl ?? null,
      position: player.profile?.position ?? null,
      stars: player.profile?.stars ?? null,
      goals: 0,
      assists: 0,
      participations: 0,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      winRate: 0,
      goalsPerMatch: 0,
      gameDays: 0,
      mmr: null,
      mmrRank: null,
      mmrTrend: null,
      mmrRankChange: null,
      mmrDelta: null,
    });
  }

  const gameDaysByPlayer = new Map<string, Set<string>>();

  // Presenca vem da escalacao da partida: quem entrou como substituto joga e
  // pontua como quem comecou, e quem saiu continua com as partidas que jogou.
  for (const { userId, teamId, match } of lineups) {
    const row = rows.get(userId);
    if (!row) continue;
    const side = teamId === match.homeTeamId ? "HOME" : "AWAY";
    row.played += 1;
    if (match.result === "DRAW") row.drawn += 1;
    else if (match.result === side) row.won += 1;
    else if (match.result) row.lost += 1;

    const seen = gameDaysByPlayer.get(userId) ?? new Set<string>();
    seen.add(match.gameDayId);
    gameDaysByPlayer.set(userId, seen);
  }

  for (const entry of events) {
    const row = rows.get(entry.userId);
    if (!row) continue;
    if (entry.type === "GOAL") row.goals += entry._count._all;
    else row.assists += entry._count._all;
  }

  for (const row of rows.values()) {
    row.participations = row.goals + row.assists;
    row.winRate = row.played > 0 ? row.won / row.played : 0;
    row.goalsPerMatch = row.played > 0 ? Math.round((row.goals / row.played) * 100) / 100 : 0;
    row.gameDays = gameDaysByPlayer.get(row.userId)?.size ?? 0;
  }

  // Ranking geral: so o MMR ordena. Empate no numero desempata pelo nome.
  const byMmr = (a: { userId: string; mmr: number }, b: { userId: string; mmr: number }) =>
    compareMmr({ mmr: a.mmr, name: rows.get(a.userId)!.name }, { mmr: b.mmr, name: rows.get(b.userId)!.name });
  const rated = ratings.filter((rating) => rows.has(rating.userId));
  const ranked = [...rated].sort(byMmr);

  // Posicao antes da ultima pelada: quem jogou volta ao MMR de antes dela, quem nao jogou nao mexeu.
  const before = new Map((lastRatedGameDay?.ratingChanges ?? []).map((change) => [change.userId, change.mmrBefore]));
  const previousRank = new Map<string, number>();
  [...rated]
    .map((rating) => ({ userId: rating.userId, mmr: before.get(rating.userId) ?? rating.mmr }))
    .sort(byMmr)
    .forEach((entry, index) => previousRank.set(entry.userId, index + 1));

  ranked.forEach((rating, index) => {
    const row = rows.get(rating.userId)!;
    row.mmr = rating.mmr;
    row.mmrRank = index + 1;
    if (lastRatedGameDay) {
      const change = previousRank.get(rating.userId)! - row.mmrRank;
      row.mmrRankChange = change;
      row.mmrTrend = change > 0 ? "up" : change < 0 ? "down" : "flat";
    }
    if (options.showMmrDelta) row.mmrDelta = rating.lastDelta;
  });

  return [...rows.values()].sort(
    (a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name, "pt-BR"),
  );
}
