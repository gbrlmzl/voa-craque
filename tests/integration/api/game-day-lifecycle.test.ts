import { POST as start } from "@/app/api/game-days/[id]/start/route";
import { POST as finish } from "@/app/api/game-days/[id]/finish/route";
import { POST as cancel } from "@/app/api/game-days/[id]/cancel/route";
import { POST as restore } from "@/app/api/game-days/[id]/restore/route";
import { finishGameDay } from "@/services/gameday";
import { prisma } from "@/lib/prisma";
import { callRoute } from "../../helpers/route";
import {
  createAdmin,
  createGameDay,
  createPlayer,
  createTeams,
  currentMatch,
  ensureSettings,
  scoreGoals,
  startLiveGameDay,
  toCurrentUser,
  whistle,
} from "../../helpers/factories";
import { actAs } from "../../helpers/session";

const post = (handler: Parameters<typeof callRoute>[0], id: string) =>
  callRoute(handler, { method: "POST", params: { id } });

describe("iniciar", () => {
  it("so organizador (403 para jogador)", async () => {
    const { gameDay } = await createTeams();
    await actAs(await createPlayer());
    expect((await post(start, gameDay.id)).status).toBe(403);
  });

  it("pelada aberta, sem times: 409 mandando montar os times", async () => {
    const gameDay = await createGameDay();
    await actAs(await createAdmin());
    const res = await post(start, gameDay.id);
    expect(res.status).toBe(409);
    expect(res.json.error).toBe("Monte os times antes de iniciar a pelada.");
  });

  it("com os times definidos passa para LIVE e audita", async () => {
    const { gameDay, admin } = await createTeams();
    await actAs(admin);
    const res = await post(start, gameDay.id);
    expect(res.json).toEqual({ ok: true, alreadyStarted: false });
    expect((await prisma.gameDay.findUniqueOrThrow({ where: { id: gameDay.id } })).status).toBe("LIVE");
    expect(await prisma.auditLog.count({ where: { action: "GAMEDAY_STARTED" } })).toBe(1);
  });

  it("dois organizadores tocando juntos: o segundo recebe alreadyStarted", async () => {
    const { gameDay, admin } = await createTeams();
    // A linha global de SystemSetting existe em producao (seed); sem ela, duas
    // requisicoes simultaneas disputariam a criacao dela.
    await ensureSettings();
    await actAs(admin);
    const [a, b] = await Promise.all([post(start, gameDay.id), post(start, gameDay.id)]);
    expect([a.json.alreadyStarted, b.json.alreadyStarted].sort()).toEqual([false, true]);
    expect(await prisma.auditLog.count({ where: { action: "GAMEDAY_STARTED" } })).toBe(1);
  });

  it.each([
    ["FINISHED", "Esta pelada já foi encerrada."],
    ["CANCELED", "Esta pelada foi cancelada."],
  ] as const)("pelada %s: 409", async (status, message) => {
    const gameDay = await createGameDay({ status });
    await actAs(await createAdmin());
    const res = await post(start, gameDay.id);
    expect(res.status).toBe(409);
    expect(res.json.error).toBe(message);
  });

  it("pelada inexistente: 404", async () => {
    await actAs(await createAdmin());
    expect((await post(start, "nao-existe")).status).toBe(404);
  });
});

describe("encerrar", () => {
  it("antes do primeiro apito: 409 sugerindo cancelar", async () => {
    const { gameDay, admin } = await startLiveGameDay();
    await actAs(admin);
    const res = await post(finish, gameDay.id);
    expect(res.status).toBe(409);
    expect(res.json.error).toMatch(/Cancelar pelada/);
  });

  it("fecha a partida em andamento, apaga a agendada, zera a fila e aplica o MMR", async () => {
    const { gameDay, admin, players } = await startLiveGameDay();
    const match = await currentMatch(gameDay.id);
    await whistle(match.id, admin);
    await scoreGoals(match.id, admin, "home", 1);
    await actAs(admin);

    expect((await post(finish, gameDay.id)).status).toBe(200);

    const after = await prisma.gameDay.findUniqueOrThrow({ where: { id: gameDay.id } });
    expect(after.status).toBe("FINISHED");
    expect(after.finishedAt).not.toBeNull();
    expect(await prisma.match.count({ where: { gameDayId: gameDay.id, status: "SCHEDULED" } })).toBe(0);
    const first = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    // Encerrar na mao uma partida que nenhuma regra decidiu grava empate, mesmo com
    // placar parcial (evaluateOutcome devolve result null e o servico usa DRAW).
    expect(first).toMatchObject({ status: "FINISHED", result: "DRAW", endReason: "MANUAL", homeScore: 1 });
    expect(await prisma.team.count({ where: { gameDayId: gameDay.id, queuePosition: { not: null } } })).toBe(0);
    expect(await prisma.ratingChange.count({ where: { gameDayId: gameDay.id } })).toBeGreaterThan(0);
    expect(await prisma.playerRating.count()).toBeGreaterThan(0);
    expect(players.length).toBe(12);
  });

  it("encerrar de novo: 409", async () => {
    const { gameDay, admin } = await startLiveGameDay();
    const match = await currentMatch(gameDay.id);
    await whistle(match.id, admin);
    await actAs(admin);
    await post(finish, gameDay.id);
    expect((await post(finish, gameDay.id)).status).toBe(409);
  });

  it("dois pedidos ao mesmo tempo aplicam o MMR uma vez so", async () => {
    const { gameDay, admin } = await startLiveGameDay();
    const match = await currentMatch(gameDay.id);
    await whistle(match.id, admin);
    await scoreGoals(match.id, admin, "home", 1);

    const results = await Promise.allSettled([
      finishGameDay(gameDay.id, toCurrentUser(admin)),
      finishGameDay(gameDay.id, toCurrentUser(admin)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    const once = await prisma.ratingChange.count({ where: { gameDayId: gameDay.id } });
    expect(once).toBeGreaterThan(0);
    const players = await prisma.teamPlayer.count({ where: { team: { gameDayId: gameDay.id } } });
    expect(once).toBeLessThanOrEqual(players);
    expect(await prisma.auditLog.count({ where: { action: "GAMEDAY_FINISHED" } })).toBe(1);
  });
});

describe("cancelar", () => {
  it("pelada aberta: apaga times e fica CANCELED, inscricoes ficam", async () => {
    const { gameDay, admin } = await createTeams();
    await actAs(admin);
    expect((await post(cancel, gameDay.id)).status).toBe(200);
    const after = await prisma.gameDay.findUniqueOrThrow({ where: { id: gameDay.id } });
    expect(after.status).toBe("CANCELED");
    expect(after.canceledAt).not.toBeNull();
    expect(await prisma.team.count({ where: { gameDayId: gameDay.id } })).toBe(0);
    expect(await prisma.match.count({ where: { gameDayId: gameDay.id } })).toBe(0);
    expect(await prisma.registration.count({ where: { gameDayId: gameDay.id } })).toBe(12);
  });

  it("LIVE sem partida iniciada ainda pode cancelar", async () => {
    const { gameDay, admin } = await startLiveGameDay();
    await actAs(admin);
    expect((await post(cancel, gameDay.id)).status).toBe(200);
  });

  it("depois do primeiro apito: 409 sugerindo encerrar", async () => {
    const { gameDay, admin } = await startLiveGameDay();
    const match = await currentMatch(gameDay.id);
    await whistle(match.id, admin);
    await actAs(admin);
    const res = await post(cancel, gameDay.id);
    expect(res.status).toBe(409);
    expect(res.json.error).toMatch(/Encerrar pelada/);
  });

  it("ja cancelada ou encerrada: 409", async () => {
    await actAs(await createAdmin());
    const canceled = await createGameDay({ status: "CANCELED" });
    const finished = await createGameDay({ status: "FINISHED" });
    expect((await post(cancel, canceled.id)).json.error).toBe("Esta pelada já foi cancelada.");
    expect((await post(cancel, finished.id)).json.error).toBe("Esta pelada já foi encerrada.");
  });
});

describe("restaurar", () => {
  it("TEAMS_SET volta para OPEN e apaga times, reservas e partida agendada", async () => {
    const { gameDay, admin } = await createTeams({ players: 13 });
    await actAs(admin);
    expect((await post(restore, gameDay.id)).status).toBe(200);
    expect((await prisma.gameDay.findUniqueOrThrow({ where: { id: gameDay.id } })).status).toBe("OPEN");
    expect(await prisma.team.count({ where: { gameDayId: gameDay.id } })).toBe(0);
    expect(await prisma.gameDayReserve.count({ where: { gameDayId: gameDay.id } })).toBe(0);
    expect(await prisma.match.count({ where: { gameDayId: gameDay.id } })).toBe(0);
  });

  it("so com times definidos: aberta e LIVE recebem 409", async () => {
    await actAs(await createAdmin());
    const open = await createGameDay();
    expect((await post(restore, open.id)).status).toBe(409);
    const { gameDay } = await startLiveGameDay();
    expect((await post(restore, gameDay.id)).json.error).toBe("Só é possível restaurar uma pelada com times definidos.");
  });
});
