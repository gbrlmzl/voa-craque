import { POST } from "@/app/api/matches/[id]/state/route";
import { prisma } from "@/lib/prisma";
import { subscribeGameDay } from "@/lib/realtime";
import { syncMatchClock } from "@/services/match";
import { callRoute } from "../../helpers/route";
import { createPlayer, createTeams, currentMatch, scoreGoals, startLiveGameDay, whistle } from "../../helpers/factories";
import { actAs } from "../../helpers/session";

const act = (id: string, action: string) => callRoute(POST, { method: "POST", params: { id }, body: { action } });

describe("POST /api/matches/[id]/state", () => {
  it("jogador comum nao apita (403)", async () => {
    const { gameDay } = await startLiveGameDay();
    const match = await currentMatch(gameDay.id);
    await actAs(await createPlayer());
    expect((await act(match.id, "START")).status).toBe(403);
  });

  it("START -> PAUSE -> RESUME -> END, com auditoria e aviso ao vivo a cada passo", async () => {
    const { gameDay, admin } = await startLiveGameDay();
    const match = await currentMatch(gameDay.id);
    await actAs(admin);
    const reasons: string[] = [];
    const stop = subscribeGameDay(gameDay.id, (notice) => reasons.push(notice.reason));

    expect((await act(match.id, "START")).status).toBe(200);
    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({ status: "RUNNING" });
    expect((await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).startedAt).not.toBeNull();

    await act(match.id, "PAUSE");
    const paused = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(paused.status).toBe("PAUSED");
    expect(paused.lastResumedAt).toBeNull();
    expect(paused.remainingMs).toBeLessThanOrEqual(paused.durationMs);

    await act(match.id, "RESUME");
    expect((await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).status).toBe("RUNNING");

    await act(match.id, "END");
    stop();
    const ended = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(ended).toMatchObject({ status: "FINISHED", endReason: "MANUAL", result: "DRAW" });
    expect(reasons).toEqual(["match-start", "match-pause", "match-resume", "match-finished"]);

    const actions = (await prisma.auditLog.findMany({ where: { entity: "Match" }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["MATCH_STARTED", "MATCH_PAUSED", "MATCH_RESUMED", "MATCH_FINISHED"]);
  });

  it("encerrar monta a proxima partida pela fila (o vencedor segue, quem perdeu vai para o fim)", async () => {
    const { gameDay, admin } = await startLiveGameDay();
    const first = await currentMatch(gameDay.id);
    await whistle(first.id, admin);
    await scoreGoals(first.id, admin, "home", gameDay.goalsToWin);

    const finished = await prisma.match.findUniqueOrThrow({ where: { id: first.id } });
    expect(finished).toMatchObject({ status: "FINISHED", result: "HOME", endReason: "GOALS", winnerTeamId: first.homeTeamId });
    const next = await prisma.match.findFirstOrThrow({ where: { gameDayId: gameDay.id, status: "SCHEDULED" }, include: { lineup: true } });
    expect(next.orderIndex).toBe(2);
    expect(next.homeTeamId).toBe(first.homeTeamId);
    expect(next.awayTeamId).not.toBe(first.awayTeamId);
    expect(next.lineup).toHaveLength(8);
    const loser = await prisma.team.findUniqueOrThrow({ where: { id: first.awayTeamId } });
    expect(loser.queuePosition).toBe(0);
  });

  it("fora de ordem: pausar quem nao comecou, retomar o que corre, iniciar duas vezes (409)", async () => {
    const { gameDay, admin } = await startLiveGameDay();
    const match = await currentMatch(gameDay.id);
    await actAs(admin);
    expect((await act(match.id, "PAUSE")).status).toBe(409);
    expect((await act(match.id, "RESUME")).status).toBe(409);
    await act(match.id, "START");
    expect((await act(match.id, "START")).status).toBe(409);
    expect((await act(match.id, "RESUME")).status).toBe(409);
  });

  it("nao apita antes de iniciar a pelada", async () => {
    const { gameDay, admin } = await createTeams();
    const match = await currentMatch(gameDay.id);
    await actAs(admin);
    const res = await act(match.id, "START");
    expect(res.status).toBe(409);
    expect(res.json.error).toBe("Inicie a pelada antes de começar a partida.");
  });

  it("acao desconhecida: 422; partida inexistente: 404", async () => {
    const { admin } = await startLiveGameDay();
    await actAs(admin);
    expect((await act("fantasma", "START")).status).toBe(404);
    expect((await act("fantasma", "VOAR")).status).toBe(422);
  });

  it("relogio com 'now' fixo: o fim por tempo acontece na primeira sincronizacao depois do prazo", async () => {
    const { gameDay, admin } = await startLiveGameDay({ matchDurationSec: 600 });
    const match = await currentMatch(gameDay.id);
    await whistle(match.id, admin);
    const startedAt = (await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).lastResumedAt!.getTime();

    expect(await syncMatchClock(gameDay.id, startedAt + 599_000)).toBe(false);
    expect((await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).status).toBe("RUNNING");

    expect(await syncMatchClock(gameDay.id, startedAt + 601_000)).toBe(true);
    const ended = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(ended).toMatchObject({ status: "FINISHED", endReason: "TIME", result: "DRAW", remainingMs: 0 });
  });

  it("fim por tempo com um time na frente: ele vence", async () => {
    const { gameDay, admin } = await startLiveGameDay({ goalsToWin: 5 });
    const match = await currentMatch(gameDay.id);
    await whistle(match.id, admin);
    await scoreGoals(match.id, admin, "away", 1);
    const startedAt = (await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).lastResumedAt!.getTime();
    await syncMatchClock(gameDay.id, startedAt + 700_000);
    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({
      result: "AWAY",
      endReason: "TIME",
      winnerTeamId: match.awayTeamId,
    });
  });

  it("sem partida correndo nada acontece", async () => {
    const { gameDay } = await startLiveGameDay();
    expect(await syncMatchClock(gameDay.id)).toBe(false);
  });

  it("pelada encerrada: 409", async () => {
    const { gameDay, admin } = await startLiveGameDay();
    const match = await currentMatch(gameDay.id);
    await prisma.gameDay.update({ where: { id: gameDay.id }, data: { status: "FINISHED" } });
    await actAs(admin);
    expect((await act(match.id, "END")).json.error).toBe("A pelada já foi encerrada.");
  });
});
