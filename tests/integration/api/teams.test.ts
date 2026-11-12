import { POST as draw } from "@/app/api/game-days/[id]/teams/draw/route";
import { PUT as setManually } from "@/app/api/game-days/[id]/teams/route";
import { GET as teamSummary } from "@/app/api/game-days/[id]/teams/[teamId]/route";
import { prisma } from "@/lib/prisma";
import { callRoute } from "../../helpers/route";
import {
  createAdmin,
  createGameDay,
  createPlayer,
  createTeams,
  registerPlayers,
  startLiveGameDay,
} from "../../helpers/factories";
import { actAs } from "../../helpers/session";

const drawTeams = (id: string, body: object = { seed: 7 }) =>
  callRoute(draw, { method: "POST", params: { id }, body });

async function openGameDay(players: number, extra: Record<string, unknown> = {}) {
  const admin = await createAdmin();
  const gameDay = await createGameDay({ createdById: admin.id, ...extra });
  const registered = await registerPlayers(gameDay.id, players);
  await actAs(admin);
  return { admin, gameDay, registered };
}

describe("POST .../teams/draw", () => {
  it("jogador comum nao sorteia (403)", async () => {
    const gameDay = await createGameDay();
    await actAs(await createPlayer());
    expect((await drawTeams(gameDay.id)).status).toBe(403);
  });

  it("12 jogadores, times de 4: 3 times completos, sem reservas, TEAMS_SET e partida de abertura", async () => {
    const { gameDay } = await openGameDay(12);
    const res = await drawTeams(gameDay.id);
    expect(res.status).toBe(200);
    expect(res.json.teams.map((t: { name: string }) => t.name)).toEqual(["A", "B", "C"]);
    expect(res.json.teams.every((t: { players: string[] }) => t.players.length === 4)).toBe(true);
    expect(res.json.reserves).toEqual([]);

    expect((await prisma.gameDay.findUniqueOrThrow({ where: { id: gameDay.id } })).status).toBe("TEAMS_SET");
    const match = await prisma.match.findFirstOrThrow({ where: { gameDayId: gameDay.id }, include: { lineup: true } });
    expect(match.status).toBe("SCHEDULED");
    expect(match.lineup).toHaveLength(8);
    const queue = await prisma.team.findMany({ where: { gameDayId: gameDay.id }, orderBy: { name: "asc" } });
    expect(queue.map((t) => t.queuePosition)).toEqual([null, null, 0]);
    expect(await prisma.auditLog.count({ where: { action: "TEAMS_DRAWN" } })).toBe(1);
  });

  it("13 jogadores: 3 times de 4 e 1 reserva", async () => {
    const { gameDay } = await openGameDay(13);
    const res = await drawTeams(gameDay.id);
    expect(res.json.teams).toHaveLength(3);
    expect(res.json.reserves).toHaveLength(1);
    expect(await prisma.gameDayReserve.count({ where: { gameDayId: gameDay.id } })).toBe(1);
  });

  it("8 jogadores: dois times", async () => {
    const { gameDay } = await openGameDay(8);
    expect((await drawTeams(gameDay.id)).json.teams).toHaveLength(2);
  });

  it("menos que dois times completos: 409 e nada muda", async () => {
    const { gameDay } = await openGameDay(7);
    const res = await drawTeams(gameDay.id);
    expect(res.status).toBe(409);
    expect(await prisma.team.count()).toBe(0);
    expect((await prisma.gameDay.findUniqueOrThrow({ where: { id: gameDay.id } })).status).toBe("OPEN");
  });

  it("pagamento recusado fica fora do sorteio", async () => {
    const { gameDay, registered } = await openGameDay(9);
    await prisma.registration.updateMany({ where: { userId: registered[0].id }, data: { paymentStatus: "REJECTED" } });
    const res = await drawTeams(gameDay.id);
    expect(res.json.teams.flatMap((t: { players: string[] }) => t.players)).toHaveLength(8);
  });

  it("a mesma semente da o mesmo sorteio; os times saem equilibrados", async () => {
    const { gameDay } = await openGameDay(12);
    const first = await drawTeams(gameDay.id, { seed: 42 });
    const second = await drawTeams(gameDay.id, { seed: 42 });
    expect(second.json.teams).toEqual(first.json.teams);
    expect(first.json.spread).toBeLessThan(2);
    const averages = first.json.teams.map((t: { averageStrength: number }) => t.averageStrength);
    expect(Math.max(...averages) - Math.min(...averages)).toBeLessThan(2);
  });

  it("refazer o sorteio em TEAMS_SET troca os times por outros, sem duplicar", async () => {
    const { gameDay } = await openGameDay(12);
    await drawTeams(gameDay.id, { seed: 1 });
    expect((await drawTeams(gameDay.id, { seed: 2 })).status).toBe(200);
    expect(await prisma.team.count({ where: { gameDayId: gameDay.id } })).toBe(3);
    expect(await prisma.match.count({ where: { gameDayId: gameDay.id } })).toBe(1);
  });

  it("sem corpo ainda sorteia (semente aleatoria)", async () => {
    const { gameDay } = await openGameDay(12);
    const res = await callRoute(draw, { method: "POST", params: { id: gameDay.id } });
    expect(res.status).toBe(200);
  });

  it("depois de iniciar a pelada os times ficam travados (409)", async () => {
    const { gameDay, admin } = await startLiveGameDay();
    await actAs(admin);
    const res = await drawTeams(gameDay.id);
    expect(res.status).toBe(409);
    expect(res.json.error).toBe("A pelada já começou. Não dá para remontar os times agora.");
  });

  it("pelada encerrada, cancelada ou inexistente", async () => {
    await actAs(await createAdmin());
    const finished = await createGameDay({ status: "FINISHED" });
    const canceled = await createGameDay({ status: "CANCELED" });
    expect((await drawTeams(finished.id)).json.error).toBe("A pelada já foi encerrada.");
    expect((await drawTeams(canceled.id)).json.error).toBe("A pelada foi cancelada.");
    expect((await drawTeams("fantasma")).status).toBe(404);
  });

  it("goleiro fixo: so um por time e vem da posicao de goleiro", async () => {
    const { gameDay } = await openGameDay(12);
    await drawTeams(gameDay.id);
    const keepers = await prisma.teamPlayer.findMany({
      where: { team: { gameDayId: gameDay.id }, isKeeper: true },
      include: { user: { include: { profile: true } } },
    });
    const perTeam = new Map<string, number>();
    for (const keeper of keepers) perTeam.set(keeper.teamId, (perTeam.get(keeper.teamId) ?? 0) + 1);
    expect([...perTeam.values()].every((n) => n === 1)).toBe(true);
    expect(keepers.every((k) => k.user.profile?.position === "GOALKEEPER")).toBe(true);
  });
});

describe("PUT .../teams (ajuste manual)", () => {
  const put = (id: string, body: object) => callRoute(setManually, { method: "PUT", params: { id }, body });

  it("monta os times do jeito que o organizador mandou", async () => {
    const { gameDay, registered } = await openGameDay(10);
    const ids = registered.map((u) => u.id);
    const res = await put(gameDay.id, {
      teams: [
        { name: "A", playerIds: ids.slice(0, 4) },
        { name: "B", playerIds: ids.slice(4, 8) },
      ],
      reserveIds: ids.slice(8),
    });
    expect(res.status).toBe(200);
    const teams = await prisma.team.findMany({ where: { gameDayId: gameDay.id }, include: { players: true }, orderBy: { name: "asc" } });
    expect(teams.map((t) => t.players.length)).toEqual([4, 4]);
    expect(await prisma.gameDayReserve.count({ where: { gameDayId: gameDay.id } })).toBe(2);
    expect((await prisma.gameDay.findUniqueOrThrow({ where: { id: gameDay.id } })).status).toBe("TEAMS_SET");
    expect(await prisma.auditLog.count({ where: { action: "TEAMS_SET_MANUALLY" } })).toBe(1);
  });

  it("jogador de fora da lista de inscritos: 400", async () => {
    const { gameDay, registered } = await openGameDay(8);
    const stranger = await createPlayer();
    const ids = registered.map((u) => u.id);
    const res = await put(gameDay.id, {
      teams: [
        { name: "A", playerIds: [...ids.slice(0, 3), stranger.id] },
        { name: "B", playerIds: ids.slice(4) },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe("Há jogador fora da lista de inscritos da pelada.");
  });

  it("jogador em dois lugares: 400; time maior que o limite: 400; so um time com gente: 400", async () => {
    const { gameDay, registered } = await openGameDay(10);
    const ids = registered.map((u) => u.id);
    expect(
      (await put(gameDay.id, { teams: [{ name: "A", playerIds: ids.slice(0, 4) }, { name: "B", playerIds: ids.slice(3, 7) }] })).json.error,
    ).toBe("O mesmo jogador foi colocado em dois lugares.");
    expect(
      (await put(gameDay.id, { teams: [{ name: "A", playerIds: ids.slice(0, 5) }, { name: "B", playerIds: ids.slice(5, 9) }] })).json.error,
    ).toMatch(/O time A tem mais que 4 jogadores/);
    expect(
      (await put(gameDay.id, { teams: [{ name: "A", playerIds: ids.slice(0, 4) }, { name: "B", playerIds: [] }] })).json.error,
    ).toBe("Monte pelo menos dois times com jogadores.");
  });

  it("menos de dois times ou mais de cinco: 422", async () => {
    const { gameDay } = await openGameDay(8);
    const res = await put(gameDay.id, { teams: [{ name: "A", playerIds: [] }] });
    expect(res.status).toBe(422);
  });

  it("travado depois de iniciar: 409", async () => {
    const { gameDay, admin, players } = await startLiveGameDay();
    await actAs(admin);
    const ids = players.map((u) => u.id);
    const res = await put(gameDay.id, { teams: [{ name: "A", playerIds: ids.slice(0, 4) }, { name: "B", playerIds: ids.slice(4, 8) }] });
    expect(res.status).toBe(409);
  });
});

describe("GET .../teams/[teamId] (resumo do time)", () => {
  it("logado le o elenco do time; visitante nao", async () => {
    const { gameDay, admin } = await createTeams();
    const team = await prisma.team.findFirstOrThrow({ where: { gameDayId: gameDay.id }, orderBy: { name: "asc" } });
    await actAs(admin);
    const res = await callRoute(teamSummary, { params: { id: gameDay.id, teamId: team.id } });
    expect(res.status).toBe(200);
    expect(res.json.players).toHaveLength(4);
    expect(res.json.team.name).toBe(team.name);
  });

  it("time de outra pelada: 404", async () => {
    const { gameDay, admin } = await createTeams();
    const other = await createTeams();
    const team = await prisma.team.findFirstOrThrow({ where: { gameDayId: other.gameDay.id } });
    await actAs(admin);
    expect((await callRoute(teamSummary, { params: { id: gameDay.id, teamId: team.id } })).status).toBe(404);
  });
});
