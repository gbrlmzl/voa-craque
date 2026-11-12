import type { LiveSnapshot } from "@/services/live";
import type { PlayerDetail } from "@/hooks/usePlayerModalProvider";
import type { RankingRow } from "@/services/ranking";

export function rankingRow(overrides: Partial<RankingRow> & { userId: string; name: string }): RankingRow {
  return {
    nickname: null,
    photoUrl: null,
    position: "ALA",
    stars: 3,
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
    ...overrides,
  };
}

export function playerDetail(overrides: Partial<PlayerDetail> = {}): PlayerDetail {
  return {
    userId: "p1",
    name: "Craque Souza",
    nickname: "CR",
    photoUrl: null,
    position: "PIVO",
    positionLabel: "Pivô",
    footLabel: "Canhoto",
    age: 27,
    heightCm: 181,
    weightKg: 78,
    stars: 4.5,
    rating: null,
    stats: { goals: 7, assists: 3, played: 10, won: 6, winRate: 0.6 },
    ...overrides,
  };
}

export function ratingDetail() {
  return {
    rank: 2,
    gameDays: 3,
    mmr: 1034.6,
    peak: 1050,
    history: [
      {
        gameDayId: "g3",
        gameDayTitle: "Pelada de sexta",
        date: "2030-05-10T20:00:00.000Z",
        delta: 12.4,
        mmrAfter: 1034.6,
        resultDelta: 6,
        attackDelta: 4,
        defenseDelta: 1.5,
        normalizeDelta: 0.5,
        stakeFactor: 1.075,
        starsUsed: 3.5,
        capped: true,
        goals: 2,
        assists: 1,
        matches: 3,
      },
      {
        gameDayId: "g2",
        gameDayTitle: "Pelada de quarta",
        date: "2030-05-03T20:00:00.000Z",
        delta: -4.2,
        mmrAfter: 1022.2,
        resultDelta: -3,
        attackDelta: 0,
        defenseDelta: -1,
        normalizeDelta: 0,
        stakeFactor: 1,
        starsUsed: null,
        capped: false,
        goals: 0,
        assists: 0,
        matches: 1,
      },
    ],
  };
}

type Side = { id: string; name: string; players: { userId: string; name: string; isKeeper: boolean; goals?: number; assists?: number }[] };

const team = (id: string, name: string, base: string): Side => ({
  id,
  name,
  players: [
    { userId: `${base}1`, name: `${name} Goleiro`, isKeeper: true },
    { userId: `${base}2`, name: `${name} Ala`, isKeeper: false },
    { userId: `${base}3`, name: `${name} Fixo`, isKeeper: false },
    { userId: `${base}4`, name: `${name} Pivo`, isKeeper: false },
  ],
});

/** Snapshot de uma pelada ao vivo com a partida 2 correndo (A x B) e C na fila. */
export function liveSnapshot(overrides: Partial<LiveSnapshot> = {}, matchOverrides: Record<string, unknown> = {}): LiveSnapshot {
  const home = team("tA", "A", "a");
  const away = team("tB", "B", "b");
  const toLiveTeam = (side: Side) => ({
    id: side.id,
    name: side.name,
    averageStrength: 50,
    roster: side.players.map((p) => p.userId),
    players: side.players.map((p) => ({ ...p, nickname: null, photoUrl: null, goals: p.goals ?? 0, assists: p.assists ?? 0 })),
  });
  return {
    gameDay: {
      id: "g1",
      title: "Pelada de sexta",
      status: "LIVE",
      goalsToWin: 2,
      matchDurationSec: 600,
      location: "Quadra do Bairro",
      scheduledAt: "2030-05-10T23:00:00.000Z",
    },
    match: {
      id: "m2",
      orderIndex: 2,
      status: "RUNNING",
      homeScore: 1,
      awayScore: 0,
      durationMs: 600_000,
      remainingMs: 300_000,
      home: toLiveTeam(home),
      away: toLiveTeam(away),
      events: [
        { id: "e2", type: "ASSIST", teamId: "tA", teamName: "A", userId: "a3", playerName: "A Fixo", elapsedMs: 120_000, createdAt: "2030-05-10T23:02:00.000Z" },
        { id: "e1", type: "GOAL", teamId: "tA", teamName: "A", userId: "a2", playerName: "A Ala", elapsedMs: 120_000, createdAt: "2030-05-10T23:02:00.000Z" },
      ],
      substitutions: [],
      bench: [],
      ...matchOverrides,
    },
    lastFinished: {
      id: "m1",
      orderIndex: 1,
      homeName: "C",
      awayName: "B",
      homeScore: 2,
      awayScore: 1,
      result: "HOME",
      endReason: "GOALS",
      winnerName: "C",
      playedMs: 240_000,
      goals: [{ id: "e0", teamName: "C", playerName: "C Ala", assistName: "C Fixo", elapsedMs: 60_000 }],
    },
    queue: [{ id: "tC", name: "C" }],
    standings: [
      { teamId: "tC", name: "C", played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 1 },
      { teamId: "tA", name: "A", played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      { teamId: "tB", name: "B", played: 1, won: 0, drawn: 0, lost: 1, goalsFor: 1, goalsAgainst: 2 },
    ],
    serverTime: Date.now(),
    ...overrides,
  } as unknown as LiveSnapshot;
}
