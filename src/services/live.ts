import type { GameDayStatus, MatchEndReason, MatchEventType, MatchStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/http";
import { remainingAt } from "@/lib/match-engine";
import { pairGoalsWithAssists } from "@/lib/match-event";
import { buildBench, type BenchPlayer } from "@/lib/substitution";
import { summarizeTeam, type FinishedMatchRow } from "@/lib/team-record";
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
  /** userIds do elenco fixo do time (TeamPlayer), que pode diferir de quem esta em quadra. */
  roster: string[];
  /** Quem esta em quadra agora, pela escalacao da partida. */
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

export type LiveSubstitution = {
  id: string;
  teamId: string;
  teamName: string;
  outName: string;
  inName: string;
  elapsedMs: number;
  permanent: boolean;
  createdAt: string;
};

/** Candidato a entrar: quem saiu da partida, quem espera na fila e as reservas. */
export type LiveBenchPlayer = BenchPlayer & {
  name: string;
  nickname: string | null;
  photoUrl: string | null;
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
  substitutions: LiveSubstitution[];
  bench: LiveBenchPlayer[];
};

/** Um gol da partida encerrada, com quem deu a assistencia (null no gol individual). */
export type FinishedGoal = {
  id: string;
  teamName: string;
  playerName: string;
  assistName: string | null;
  elapsedMs: number;
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
  /** Tempo jogado, do apito inicial ao fim (pode ser menor que a duracao). */
  playedMs: number;
  /** Gols em ordem, so da ultima partida encerrada: nao incha o snapshot do SSE. */
  goals: FinishedGoal[];
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
                  username: true,
                  profile: { select: { name: true, nickname: true, photoUrl: true } },
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
              user: { select: { username: true, profile: { select: { name: true, nickname: true } } } },
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

  // Escalacao, trocas e reservas so interessam a partida atual: carregar de todas
  // as partidas, como os lances, incharia o snapshot que o SSE empurra a cada mudanca.
  const userSelect = {
    select: {
      id: true,
      username: true,
      profile: { select: { name: true, nickname: true, photoUrl: true } },
    },
  } as const;
  const [lineup, substitutionRows, reserves] = current
    ? await Promise.all([
        prisma.matchPlayer.findMany({ where: { matchId: current.id }, include: { user: userSelect } }),
        prisma.matchSubstitution.findMany({
          where: { matchId: current.id },
          orderBy: { createdAt: "desc" },
          include: { team: { select: { name: true } }, outUser: userSelect, inUser: userSelect },
        }),
        prisma.gameDayReserve.findMany({ where: { gameDayId }, include: { user: userSelect } }),
      ])
    : [[], [], []];

  type Person = { id: string; username: string; profile: { name: string; nickname: string | null; photoUrl: string | null } | null };
  const people = new Map<string, Person>();
  for (const team of gameDay.teams) for (const member of team.players) people.set(member.userId, member.user);
  for (const row of lineup) people.set(row.userId, row.user);
  for (const reserve of reserves) people.set(reserve.userId, reserve.user);

  const displayName = (person: Person | undefined): string =>
    person?.profile?.nickname || person?.profile?.name || person?.username || "?";

  const toLiveTeam = (teamId: string, events: typeof gameDay.matches[number]["events"]): LiveTeam => {
    const team = teamsById.get(teamId);
    if (!team) {
      return { id: teamId, name: "?", averageStrength: 0, roster: [], players: [] };
    }
    return {
      id: team.id,
      name: team.name,
      averageStrength: team.averageStrength,
      roster: team.players.map((member) => member.userId),
      players: lineup
        .filter((row) => row.teamId === teamId && row.onCourt)
        .map((row) => ({
          userId: row.userId,
          name: displayName(row.user),
          nickname: row.user.profile?.nickname ?? null,
          photoUrl: row.user.profile?.photoUrl ?? null,
          isKeeper: row.isKeeper,
          goals: events.filter((e) => e.userId === row.userId && e.type === "GOAL").length,
          assists: events.filter((e) => e.userId === row.userId && e.type === "ASSIST").length,
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
          playerName: event.user.profile?.name ?? event.user.username,
          elapsedMs: event.elapsedMs,
          createdAt: event.createdAt.toISOString(),
        })),
        substitutions: substitutionRows.map((row) => ({
          id: row.id,
          teamId: row.teamId,
          teamName: row.team.name,
          outName: displayName(row.outUser),
          inName: displayName(row.inUser),
          elapsedMs: row.elapsedMs,
          permanent: row.permanent,
          createdAt: row.createdAt.toISOString(),
        })),
        bench: buildBench({
          homeTeamId: current.homeTeamId,
          awayTeamId: current.awayTeamId,
          lineup,
          rosters: gameDay.teams.map((team) => ({
            teamId: team.id,
            queuePosition: team.queuePosition,
            userIds: team.players.map((member) => member.userId),
          })),
          reserveIds: reserves.map((reserve) => reserve.userId),
        }).map((player) => {
          const person = people.get(player.userId);
          return {
            ...player,
            name: displayName(person),
            nickname: person?.profile?.nickname ?? null,
            photoUrl: person?.profile?.photoUrl ?? null,
          };
        }),
      }
    : null;

  // Mesma regra do modal do time (lib/team-record.ts), para as duas telas nunca divergirem.
  const finishedRows: FinishedMatchRow[] = finishedMatches.map((finished) => ({
    id: finished.id,
    orderIndex: finished.orderIndex,
    homeTeamId: finished.homeTeamId,
    awayTeamId: finished.awayTeamId,
    homeScore: finished.homeScore,
    awayScore: finished.awayScore,
    result: finished.result,
  }));
  const standings: LiveStanding[] = gameDay.teams.map((team) => ({
    teamId: team.id,
    name: team.name,
    ...summarizeTeam(team.id, finishedRows).record,
  }));

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
          playedMs: Math.max(0, lastFinishedRow.durationMs - lastFinishedRow.remainingMs),
          // Mesmo nome exibido do painel e do toast (apelido primeiro), nao o do feed de lances.
          goals: pairGoalsWithAssists(
            lastFinishedRow.events.map((event) => ({
              id: event.id,
              type: event.type,
              teamId: event.teamId,
              teamName: event.team.name,
              elapsedMs: event.elapsedMs,
              createdAt: event.createdAt.toISOString(),
              playerName: event.user.profile?.nickname || event.user.profile?.name || event.user.username,
            })),
          ).map(({ goal, assist }) => ({
            id: goal.id,
            teamName: goal.teamName,
            playerName: goal.playerName,
            assistName: assist?.playerName ?? null,
            elapsedMs: goal.elapsedMs,
          })),
        }
      : null,
    queue: gameDay.teams
      .filter((team) => team.queuePosition !== null)
      .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))
      .map((team) => ({ id: team.id, name: team.name })),
    standings: standings.sort(
      (a, b) => b.won - a.won || b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst),
    ),
    serverTime: now,
  };
}
