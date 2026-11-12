import { prisma } from "@/lib/prisma";
import { deleteScheduledMatch, ensureOpeningMatch, finalizeMatch, undoMatchEvent } from "@/services/match";
import { buildTeamSummary } from "@/services/team-summary";
import { buildGameDayStats } from "@/services/gameday-stats";
import {
  createGameDay,
  createTeams,
  currentMatch,
  finishGameDay,
  registerPlayers,
  scoreGoals,
  startLiveGameDay,
  toCurrentUser,
  whistle,
} from "../../helpers/factories";

describe("ensureOpeningMatch", () => {
  it("e idempotente: nao cria uma segunda partida", async () => {
    const { gameDay } = await createTeams();
    await ensureOpeningMatch(gameDay.id);
    await ensureOpeningMatch(gameDay.id);
    expect(await prisma.match.count({ where: { gameDayId: gameDay.id } })).toBe(1);
  });

  it("sem dois times: 409", async () => {
    const gameDay = await createGameDay();
    await registerPlayers(gameDay.id, 4);
    await expect(ensureOpeningMatch(gameDay.id)).rejects.toMatchObject({ status: 409 });
  });

  it("os dois primeiros times entram em quadra e o resto vai para a fila", async () => {
    const { gameDay } = await createTeams({ players: 16 });
    const teams = await prisma.team.findMany({ where: { gameDayId: gameDay.id }, orderBy: { name: "asc" } });
    expect(teams.map((t) => t.queuePosition)).toEqual([null, null, 0, 1]);
  });
});

describe("finalizeMatch", () => {
  const finish = (matchId: string, admin: Parameters<typeof toCurrentUser>[0], result: "HOME" | "AWAY" | "DRAW") =>
    finalizeMatch({ matchId, actor: toCurrentUser(admin), reason: "MANUAL", result, now: Date.now() });

  it("quem ganha fica e o adversario vai para o fim da fila", async () => {
    const { gameDay, admin } = await startLiveGameDay();
    const first = await currentMatch(gameDay.id);
    await whistle(first.id, admin);
    await finish(first.id, admin, "AWAY");
    const next = await prisma.match.findFirstOrThrow({ where: { gameDayId: gameDay.id, status: "SCHEDULED" } });
    expect(next.homeTeamId).toBe(first.awayTeamId);
    expect(next.awayTeamId).not.toBe(first.homeTeamId);
    expect((await prisma.team.findUniqueOrThrow({ where: { id: first.homeTeamId } })).queuePosition).toBe(0);
  });

  it("empate: os dois saem e entram os dois da fila (3 times: um espera)", async () => {
    const { gameDay, admin } = await startLiveGameDay({ players: 16 });
    const first = await currentMatch(gameDay.id);
    await whistle(first.id, admin);
    await finish(first.id, admin, "DRAW");
    const next = await prisma.match.findFirstOrThrow({ where: { gameDayId: gameDay.id, status: "SCHEDULED" } });
    expect([next.homeTeamId, next.awayTeamId]).not.toContain(first.homeTeamId);
    expect([next.homeTeamId, next.awayTeamId]).not.toContain(first.awayTeamId);
    const queued = await prisma.team.findMany({ where: { gameDayId: gameDay.id, queuePosition: { not: null } }, orderBy: { queuePosition: "asc" } });
    expect(queued.map((t) => t.id)).toEqual([first.homeTeamId, first.awayTeamId]);
  });

  it("encerrar de novo uma partida ja encerrada nao muda nada", async () => {
    const { gameDay, admin } = await startLiveGameDay();
    const first = await currentMatch(gameDay.id);
    await whistle(first.id, admin);
    await finish(first.id, admin, "HOME");
    const matches = await prisma.match.count({ where: { gameDayId: gameDay.id } });
    await finish(first.id, admin, "AWAY");
    expect(await prisma.match.count({ where: { gameDayId: gameDay.id } })).toBe(matches);
    expect((await prisma.match.findUniqueOrThrow({ where: { id: first.id } })).result).toBe("HOME");
  });

  it("partida inexistente: 404", async () => {
    const { admin } = await startLiveGameDay();
    await expect(finish("fantasma", admin, "HOME")).rejects.toMatchObject({ status: 404 });
  });
});

describe("deleteScheduledMatch e undoMatchEvent", () => {
  it("apagar a partida agendada desfaz a troca permanente feita nela", async () => {
    const { gameDay, admin } = await startLiveGameDay({ players: 13 });
    const match = await currentMatch(gameDay.id);
    const reserve = await prisma.gameDayReserve.findFirstOrThrow({ where: { gameDayId: gameDay.id } });
    const out = match.homeTeam.players[0].userId;
    const { recordSubstitution } = await import("@/services/match");
    await recordSubstitution(match.id, { teamId: match.homeTeamId, outUserId: out, inUserId: reserve.userId, permanent: true }, toCurrentUser(admin));
    expect(await prisma.teamPlayer.count({ where: { teamId: match.homeTeamId, userId: reserve.userId } })).toBe(1);

    await prisma.$transaction((tx) => deleteScheduledMatch(tx, gameDay.id, match.id));
    expect(await prisma.teamPlayer.count({ where: { teamId: match.homeTeamId, userId: out } })).toBe(1);
    expect(await prisma.teamPlayer.count({ where: { teamId: match.homeTeamId, userId: reserve.userId } })).toBe(0);
    expect(await prisma.match.count({ where: { id: match.id } })).toBe(0);
  });

  it("desfazer o gol de uma partida que acabou pelo tempo fecha de novo pelo tempo, com o placar certo", async () => {
    const { gameDay, admin } = await startLiveGameDay({ goalsToWin: 5, matchDurationSec: 60 });
    const match = await currentMatch(gameDay.id);
    await whistle(match.id, admin);
    const [goal] = await scoreGoals(match.id, admin, "home", 1, { assist: false });
    await finalizeMatch({ matchId: match.id, actor: null, reason: "TIME", result: "HOME", now: Date.now() + 120_000 });
    await prisma.match.update({ where: { id: match.id }, data: { remainingMs: 0 } });

    await undoMatchEvent(match.id, goal.eventId, toCurrentUser(admin));
    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({
      status: "FINISHED",
      endReason: "TIME",
      result: "DRAW",
      homeScore: 0,
    });
  });
});

describe("buildTeamSummary", () => {
  it("elenco ordenado, fila e retrospecto com o nome do adversario", async () => {
    const { gameDay, admin } = await startLiveGameDay();
    const first = await currentMatch(gameDay.id);
    await whistle(first.id, admin);
    await scoreGoals(first.id, admin, "home", 2);

    const summary = await buildTeamSummary(gameDay.id, first.homeTeamId);
    expect(summary.team).toMatchObject({ id: first.homeTeamId, queuePosition: null });
    expect(summary.players).toHaveLength(4);
    expect(summary.record).toMatchObject({ played: 1, won: 1, goalsFor: 2, goalsAgainst: 0 });
    expect(summary.history[0].opponentName).toBeTruthy();
    const loser = await buildTeamSummary(gameDay.id, first.awayTeamId);
    expect(loser.record).toMatchObject({ played: 1, lost: 1 });
    expect(loser.team.queuePosition).toBe(1);
  });

  it("time de outra pelada: 404", async () => {
    const a = await createTeams();
    const b = await createTeams();
    const team = await prisma.team.findFirstOrThrow({ where: { gameDayId: b.gameDay.id } });
    await expect(buildTeamSummary(a.gameDay.id, team.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("buildGameDayStats", () => {
  it("so quem jogou entra; gols, assistencias, vitorias e selos de artilheiro e MVP", async () => {
    const { gameDay } = await finishGameDay({ players: 13 });
    const stats = await buildGameDayStats(gameDay.id, { canSeeMmr: true });
    expect(stats.length).toBe(12); // o reserva nao jogou
    expect(stats.every((s) => s.played > 0)).toBe(true);
    expect(stats.reduce((sum, s) => sum + s.goals, 0)).toBeGreaterThanOrEqual(4);
    expect(stats.filter((s) => s.topScorer).length).toBeGreaterThanOrEqual(1);
    expect(stats.filter((s) => s.mvp)).toHaveLength(1);
    expect(stats.every((s) => s.mmrDelta !== null)).toBe(true);
    const winner = stats.find((s) => s.won > 0)!;
    expect(winner.winRate).toBeGreaterThan(0);
  });

  it("sem permissao de MMR nao devolve o numero", async () => {
    const { gameDay } = await finishGameDay();
    const stats = await buildGameDayStats(gameDay.id, { canSeeMmr: false });
    expect(stats.every((s) => s.mmrDelta === null)).toBe(true);
    expect(stats.some((s) => s.mvp)).toBe(true);
  });

  it("pelada sem partida encerrada: ninguem jogou", async () => {
    const { gameDay } = await createTeams();
    expect(await buildGameDayStats(gameDay.id, { canSeeMmr: false })).toEqual([]);
  });
});
