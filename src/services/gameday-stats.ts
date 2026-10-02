import { prisma } from "@/lib/prisma";

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
};

/**
 * Estatisticas de uma pelada especifica, so entre quem se inscreveu e jogou de
 * verdade: quem tem linha na escalacao de uma partida encerrada, seja titular
 * ou substituto. "Artilheiro" aqui e sempre relativo a essa pelada, nunca ao
 * acumulado geral do ranking.
 */
export async function buildGameDayStats(gameDayId: string): Promise<GameDayPlayerStats[]> {
  const [registrations, lineups, events] = await Promise.all([
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

  return [...rows.values()].filter((row) => row.played > 0);
}
