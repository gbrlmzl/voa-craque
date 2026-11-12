import { POST } from "@/app/api/matches/[id]/events/route";
import { DELETE } from "@/app/api/matches/[id]/events/[eventId]/route";
import { prisma } from "@/lib/prisma";
import { callRoute } from "../../helpers/route";
import { createPlayer, currentMatch, scoreGoals, startLiveGameDay, whistle } from "../../helpers/factories";
import { actAs } from "../../helpers/session";

async function runningMatch(options: Parameters<typeof startLiveGameDay>[0] = { goalsToWin: 3 }) {
  const live = await startLiveGameDay(options);
  const match = await currentMatch(live.gameDay.id);
  await whistle(match.id, live.admin);
  await actAs(live.admin);
  return { ...live, match };
}

const score = (matchId: string, body: object) => callRoute(POST, { method: "POST", params: { id: matchId }, body });
const undo = (matchId: string, eventId: string, query = "") =>
  callRoute(DELETE, { method: "DELETE", params: { id: matchId, eventId }, path: `/api/matches/${matchId}/events/${eventId}${query}` });

describe("POST /api/matches/[id]/events", () => {
  it("gol com assistencia: dois eventos no mesmo minuto e placar atualizado", async () => {
    const { match } = await runningMatch();
    const [scorer, assistant] = match.homeTeam.players;
    const res = await score(match.id, { type: "GOAL", userId: scorer.userId, teamId: match.homeTeamId, assistUserId: assistant.userId });
    expect(res.status).toBe(200);
    expect(res.json.assistEventId).toBeTruthy();

    const events = await prisma.matchEvent.findMany({ where: { matchId: match.id }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.type)).toEqual(["GOAL", "ASSIST"]);
    expect(events[0].elapsedMs).toBe(events[1].elapsedMs);
    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({ homeScore: 1, awayScore: 0 });
    expect(await prisma.auditLog.count({ where: { action: "MATCH_EVENT_CREATED" } })).toBe(2);
  });

  it("gol sem assistencia", async () => {
    const { match } = await runningMatch();
    const res = await score(match.id, { type: "GOAL", userId: match.awayTeam.players[0].userId, teamId: match.awayTeamId });
    expect(res.json.assistEventId).toBeNull();
    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({ homeScore: 0, awayScore: 1 });
  });

  it("o gol decisivo encerra a partida e leva a assistencia junto", async () => {
    const { match, gameDay } = await runningMatch({ goalsToWin: 2 });
    await scoreGoals(match.id, (await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } })), "home", 2);
    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({ status: "FINISHED", endReason: "GOALS", result: "HOME" });
    expect(await prisma.matchEvent.count({ where: { matchId: match.id, type: "ASSIST" } })).toBe(2);
    expect(await prisma.match.count({ where: { gameDayId: gameDay.id } })).toBe(2);
  });

  it("assistencia sozinha so vale como par de um gol", async () => {
    const { match } = await runningMatch();
    const res = await score(match.id, {
      type: "ASSIST",
      userId: match.homeTeam.players[0].userId,
      teamId: match.homeTeamId,
      assistUserId: match.homeTeam.players[1].userId,
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe("Só um gol pode ter assistência.");
  });

  it("quem fez o gol nao da a assistencia; jogador de outro time: 400", async () => {
    const { match } = await runningMatch();
    const [a] = match.homeTeam.players;
    expect((await score(match.id, { type: "GOAL", userId: a.userId, teamId: match.homeTeamId, assistUserId: a.userId })).json.error).toBe(
      "Quem fez o gol não pode dar a assistência.",
    );
    expect((await score(match.id, { type: "GOAL", userId: match.awayTeam.players[0].userId, teamId: match.homeTeamId })).json.error).toBe(
      "Este jogador não está neste time.",
    );
    expect(
      (await score(match.id, { type: "GOAL", userId: a.userId, teamId: match.homeTeamId, assistUserId: match.awayTeam.players[0].userId })).json.error,
    ).toBe("Quem deu a assistência não está neste time.");
  });

  it("time que nao joga a partida: 400", async () => {
    const { match, gameDay } = await runningMatch();
    const waiting = await prisma.team.findFirstOrThrow({ where: { gameDayId: gameDay.id, id: { notIn: [match.homeTeamId, match.awayTeamId] } }, include: { players: true } });
    const res = await score(match.id, { type: "GOAL", userId: waiting.players[0].userId, teamId: waiting.id });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe("Este time não está nesta partida.");
  });

  it("partida nao iniciada: 409; encerrada: 409", async () => {
    const live = await startLiveGameDay();
    const match = await currentMatch(live.gameDay.id);
    await actAs(live.admin);
    const body = { type: "GOAL", userId: match.homeTeam.players[0].userId, teamId: match.homeTeamId };
    expect((await score(match.id, body)).json.error).toBe("Inicie a partida antes de marcar.");
    await prisma.match.update({ where: { id: match.id }, data: { status: "FINISHED" } });
    expect((await score(match.id, body)).json.error).toBe("A partida já foi encerrada.");
  });

  it("so organizador marca (403); dados incompletos: 422; partida inexistente: 404", async () => {
    const { match } = await runningMatch();
    const body = { type: "GOAL", userId: match.homeTeam.players[0].userId, teamId: match.homeTeamId };
    expect((await score("fantasma", body)).status).toBe(404);
    expect((await score(match.id, { type: "GOAL" })).status).toBe(422);
    await actAs(await createPlayer());
    expect((await score(match.id, body)).status).toBe(403);
  });
});

describe("DELETE /api/matches/[id]/events/[eventId]", () => {
  it("desfazer o gol recalcula o placar e remove a assistencia ligada", async () => {
    const { match, admin } = await runningMatch();
    const [first] = await scoreGoals(match.id, admin, "home", 1);
    await scoreGoals(match.id, admin, "home", 1, { assist: false });
    expect((await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).homeScore).toBe(2);

    const res = await undo(match.id, first.eventId, `?assistEventId=${first.assistEventId}`);
    expect(res.status).toBe(200);
    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({ homeScore: 1 });
    expect(await prisma.matchEvent.count({ where: { matchId: match.id, type: "ASSIST" } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "MATCH_EVENT_UNDONE" } })).toBe(2);
  });

  it("desfazer o gol que encerrou a partida reabre a partida e reverte a fila e a proxima partida", async () => {
    const { match, gameDay, admin } = await runningMatch({ goalsToWin: 2 });
    const goals = await scoreGoals(match.id, admin, "home", 2);
    expect(await prisma.match.count({ where: { gameDayId: gameDay.id } })).toBe(2);

    const res = await undo(match.id, goals[1].eventId, `?assistEventId=${goals[1].assistEventId}`);
    expect(res.status).toBe(200);
    const reopened = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(reopened).toMatchObject({ status: "PAUSED", homeScore: 1, result: null, endReason: null, winnerTeamId: null });
    expect(await prisma.match.count({ where: { gameDayId: gameDay.id } })).toBe(1);
    const queue = await prisma.team.findMany({ where: { gameDayId: gameDay.id }, orderBy: { name: "asc" } });
    expect(queue.map((t) => t.queuePosition)).toEqual([null, null, 0]);
  });

  it("assistencia que nao e deste gol: 400; evento de outra partida ou inexistente: 404", async () => {
    const { match, admin } = await runningMatch({ goalsToWin: 5 });
    const [a] = await scoreGoals(match.id, admin, "home", 1);
    const [b] = await scoreGoals(match.id, admin, "away", 1);
    expect((await undo(match.id, a.eventId, `?assistEventId=${b.assistEventId}`)).status).toBe(400);
    expect((await undo(match.id, "fantasma")).status).toBe(404);
  });

  it("pelada encerrada nao desfaz evento (409)", async () => {
    const { match, gameDay, admin } = await runningMatch({ goalsToWin: 5 });
    const [a] = await scoreGoals(match.id, admin, "home", 1);
    await prisma.gameDay.update({ where: { id: gameDay.id }, data: { status: "FINISHED" } });
    expect((await undo(match.id, a.eventId)).json.error).toBe("A pelada já foi encerrada.");
  });
});
