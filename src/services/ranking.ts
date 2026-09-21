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
};

/**
 * Ranking a partir das partidas ja encerradas. Partida em andamento so entra na
 * conta depois que acaba, igual ao que o painel ao vivo mostra.
 */
export async function buildRanking(): Promise<RankingRow[]> {
  const [players, matches, events] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, profile: { completed: true } },
      select: {
        id: true,
        name: true,
        profile: { select: { nickname: true, photoUrl: true, position: true, stars: true } },
      },
    }),
    prisma.match.findMany({
      where: { status: "FINISHED" },
      select: {
        id: true,
        gameDayId: true,
        result: true,
        homeTeamId: true,
        awayTeamId: true,
        homeTeam: { select: { players: { select: { userId: true } } } },
        awayTeam: { select: { players: { select: { userId: true } } } },
      },
    }),
    prisma.matchEvent.groupBy({
      by: ["userId", "type"],
      where: { match: { status: "FINISHED" } },
      _count: { _all: true },
    }),
  ]);

  const rows = new Map<string, RankingRow>();
  for (const player of players) {
    rows.set(player.id, {
      userId: player.id,
      name: player.name,
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
    });
  }

  const gameDaysByPlayer = new Map<string, Set<string>>();

  for (const match of matches) {
    const sides = [
      { userIds: match.homeTeam.players.map((p) => p.userId), side: "HOME" as const },
      { userIds: match.awayTeam.players.map((p) => p.userId), side: "AWAY" as const },
    ];

    for (const { userIds, side } of sides) {
      for (const userId of userIds) {
        const row = rows.get(userId);
        if (!row) continue;
        row.played += 1;
        if (match.result === "DRAW") row.drawn += 1;
        else if (match.result === side) row.won += 1;
        else if (match.result) row.lost += 1;

        const seen = gameDaysByPlayer.get(userId) ?? new Set<string>();
        seen.add(match.gameDayId);
        gameDaysByPlayer.set(userId, seen);
      }
    }
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

  return [...rows.values()].sort(
    (a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name, "pt-BR"),
  );
}
