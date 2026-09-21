import type { GameDayStatus, MatchEndReason, MatchEventType, MatchStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/http";
import { remainingAt } from "@/lib/match-engine";
import { syncMatchClock } from "@/services/match";

export type LivePlayer = {
  userId: string;
  name: string;
  nickname: string | null;
  photoUrl: string | null;
  isKeeper: boolean;
  goals: number;
  assists: number;
};

export type LiveTeam = {
  id: string;
  name: string;
  averageStrength: number;
  players: LivePlayer[];
};

export type LiveEvent = {
  id: string;
  type: MatchEventType;
  teamId: string;
  teamName: string;
  userId: string;
  playerName: string;
  elapsedMs: number;
  createdAt: string;
};

export type LiveMatch = {
  id: string;
  orderIndex: number;
  status: MatchStatus;
  homeScore: number;
  awayScore: number;
  durationMs: number;
  remainingMs: number;
  home: LiveTeam;
  away: LiveTeam;
  events: LiveEvent[];
};

export type FinishedMatch = {
  id: string;
  orderIndex: number;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  result: "HOME" | "AWAY" | "DRAW" | null;
  endReason: MatchEndReason | null;
  winnerName: string | null;
};

export type LiveStanding = {
  teamId: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
};

export type LiveSnapshot = {
  gameDay: {
    id: string;
    title: string;
    status: GameDayStatus;
    goalsToWin: number;
    matchDurationSec: number;
    location: string;
    scheduledAt: string;
  };
  match: LiveMatch | null;
  lastFinished: FinishedMatch | null;
  queue: { id: string; name: string }[];
  standings: LiveStanding[];
  serverTime: number;
};

/**
 * Estado completo da pelada para o painel do admin e para a tela de espectador.
 * Antes de montar, encerra a partida cujo cronometro ja zerou: e aqui que o fim
 * por tempo acontece, sem depender de o admin ter a tela aberta.
 */
export async function buildLiveSnapshot(gameDayId: string): Promise<LiveSnapshot> {
  await syncMatchClock(gameDayId);

  const gameDay = await prisma.gameDay.findUnique({
    where: { id: gameDayId },
    include: {
      teams: {
        orderBy: { name: "asc" },
        include: {
          players: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  profile: { select: { nickname: true, photoUrl: true } },
                },
              },
            },
          },
        },
      },
      matches: {
        orderBy: { orderIndex: "asc" },
        include: {
          events: {
            orderBy: { createdAt: "desc" },
            include: {
              user: { select: { name: true } },
              team: { select: { name: true } },
            },
          },
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
          winnerTeam: { select: { name: true } },
        },
      },
    },
  });

  if (!gameDay) throw notFound("Pelada não encontrada.");

  const now = Date.now();
  const teamsById = new Map(gameDay.teams.map((team) => [team.id, team]));
  const current = gameDay.matches.find((match) => match.status !== "FINISHED") ?? null;
  const finishedMatches = gameDay.matches.filter((match) => match.status === "FINISHED");
  const lastFinishedRow = finishedMatches.at(-1) ?? null;

  const toLiveTeam = (teamId: string, events: typeof gameDay.matches[number]["events"]): LiveTeam => {
    const team = teamsById.get(teamId);
    if (!team) {
      return { id: teamId, name: "?", averageStrength: 0, players: [] };
    }
    return {
      id: team.id,
      name: team.name,
      averageStrength: team.averageStrength,
      players: team.players
        .map((member) => ({
          userId: member.userId,
          name: member.user.profile?.nickname || member.user.name,
          nickname: member.user.profile?.nickname ?? null,
          photoUrl: member.user.profile?.photoUrl ?? null,
          isKeeper: member.isKeeper,
          goals: events.filter((e) => e.userId === member.userId && e.type === "GOAL").length,
          assists: events.filter((e) => e.userId === member.userId && e.type === "ASSIST").length,
        }))
        .sort((a, b) => Number(b.isKeeper) - Number(a.isKeeper) || a.name.localeCompare(b.name, "pt-BR")),
    };
  };

  const match: LiveMatch | null = current
    ? {
        id: current.id,
        orderIndex: current.orderIndex,
        status: current.status,
        homeScore: current.homeScore,
        awayScore: current.awayScore,
        durationMs: current.durationMs,
        remainingMs: remainingAt(
          {
            status: current.status,
            durationMs: current.durationMs,
            remainingMs: current.remainingMs,
            lastResumedAt: current.lastResumedAt?.getTime() ?? null,
          },
          now,
        ),
        home: toLiveTeam(current.homeTeamId, current.events),
        away: toLiveTeam(current.awayTeamId, current.events),
        events: current.events.map((event) => ({
          id: event.id,
          type: event.type,
          teamId: event.teamId,
          teamName: event.team.name,
          userId: event.userId,
          playerName: event.user.name,
          elapsedMs: event.elapsedMs,
          createdAt: event.createdAt.toISOString(),
        })),
      }
    : null;

  const standings = new Map<string, LiveStanding>();
  for (const team of gameDay.teams) {
    standings.set(team.id, {
      teamId: team.id,
      name: team.name,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
    });
  }
  for (const finished of finishedMatches) {
    const home = standings.get(finished.homeTeamId);
    const away = standings.get(finished.awayTeamId);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.goalsFor += finished.homeScore;
    home.goalsAgainst += finished.awayScore;
    away.goalsFor += finished.awayScore;
    away.goalsAgainst += finished.homeScore;

    if (finished.result === "HOME") {
      home.won += 1;
      away.lost += 1;
    } else if (finished.result === "AWAY") {
      away.won += 1;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
    }
  }

  return {
    gameDay: {
      id: gameDay.id,
      title: gameDay.title,
      status: gameDay.status,
      goalsToWin: gameDay.goalsToWin,
      matchDurationSec: gameDay.matchDurationSec,
      location: gameDay.location,
      scheduledAt: gameDay.scheduledAt.toISOString(),
    },
    match,
    lastFinished: lastFinishedRow
      ? {
          id: lastFinishedRow.id,
          orderIndex: lastFinishedRow.orderIndex,
          homeName: lastFinishedRow.homeTeam.name,
          awayName: lastFinishedRow.awayTeam.name,
          homeScore: lastFinishedRow.homeScore,
          awayScore: lastFinishedRow.awayScore,
          result: lastFinishedRow.result,
          endReason: lastFinishedRow.endReason,
          winnerName: lastFinishedRow.winnerTeam?.name ?? null,
        }
      : null,
    queue: gameDay.teams
      .filter((team) => team.queuePosition !== null)
      .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))
      .map((team) => ({ id: team.id, name: team.name })),
    standings: [...standings.values()].sort(
      (a, b) => b.won - a.won || b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst),
    ),
    serverTime: now,
  };
}
