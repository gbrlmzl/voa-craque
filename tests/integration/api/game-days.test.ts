import { GET, POST } from "@/app/api/game-days/route";
import { PATCH } from "@/app/api/game-days/[id]/route";
import { prisma } from "@/lib/prisma";
import { callRoute } from "../../helpers/route";
import { createAdmin, createGameDay, createPlayer, createTeams, registerPlayers, startLiveGameDay } from "../../helpers/factories";
import { actAs, asVisitor } from "../../helpers/session";

const body = {
  title: "Pelada de sexta",
  scheduledAt: "2030-05-10T20:00:00-03:00",
  location: "Quadra do Bairro",
  pricePerPlayerCents: 1200,
  matchDurationSec: 600,
  goalsToWin: 2,
  maxPlayers: 20,
  teamSize: 4,
  pixKey: "pix@voacraque.app",
  notes: "",
};

describe("GET /api/game-days", () => {
  it("visitante recebe 401 (as paginas publicas leem direto, nao por esta API)", async () => {
    asVisitor();
    expect((await callRoute(GET)).status).toBe(401);
  });

  it("jogador lista as peladas da mais nova para a mais antiga, com a contagem de inscritos", async () => {
    await actAs(await createPlayer());
    const old = await createGameDay({ title: "Antiga", scheduledAt: new Date("2029-01-01") });
    await createGameDay({ title: "Nova", scheduledAt: new Date("2031-01-01") });
    await registerPlayers(old.id, 3);
    const res = await callRoute(GET);
    expect(res.status).toBe(200);
    expect(res.json.gameDays.map((g: { title: string }) => g.title)).toEqual(["Nova", "Antiga"]);
    expect(res.json.gameDays[1]._count.registrations).toBe(3);
  });
});

describe("POST /api/game-days", () => {
  it("jogador comum nao cria (403)", async () => {
    await actAs(await createPlayer());
    expect((await callRoute(POST, { method: "POST", body })).status).toBe(403);
    expect(await prisma.gameDay.count()).toBe(0);
  });

  it("visitante recebe 401", async () => {
    asVisitor();
    expect((await callRoute(POST, { method: "POST", body })).status).toBe(401);
  });

  it("organizador cria a pelada e a auditoria registra", async () => {
    const admin = await createAdmin();
    await actAs(admin);
    const res = await callRoute(POST, { method: "POST", body: { ...body, notes: "Traga colete" } });
    expect(res.status).toBe(200);

    const gameDay = await prisma.gameDay.findUniqueOrThrow({ where: { id: res.json.id } });
    expect(gameDay).toMatchObject({
      title: "Pelada de sexta",
      status: "OPEN",
      createdById: admin.id,
      pricePerPlayerCents: 1200,
      notes: "Traga colete",
    });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "GAMEDAY_CREATED" } });
    expect(audit).toMatchObject({ entityId: gameDay.id, actorId: admin.id, summary: "Pelada de sexta" });
  });

  it("notas vazias viram null", async () => {
    await actAs(await createAdmin());
    const res = await callRoute(POST, { method: "POST", body });
    expect((await prisma.gameDay.findUniqueOrThrow({ where: { id: res.json.id } })).notes).toBeNull();
  });

  it("dados invalidos: 422 com o erro por campo, e nada gravado", async () => {
    await actAs(await createAdmin());
    const res = await callRoute(POST, {
      method: "POST",
      body: { ...body, title: "ab", maxPlayers: 5, teamSize: 9, pixKey: "", matchDurationSec: 10 },
    });
    expect(res.status).toBe(422);
    expect(res.json.error).toBe("Dados inválidos.");
    expect(Object.keys(res.json.details).sort()).toEqual(["matchDurationSec", "maxPlayers", "pixKey", "teamSize", "title"]);
    expect(res.json.details.title).toBe("De um nome para a pelada.");
    expect(await prisma.gameDay.count()).toBe(0);
  });

  it("data invalida", async () => {
    await actAs(await createAdmin());
    const res = await callRoute(POST, { method: "POST", body: { ...body, scheduledAt: "ontem de manha" } });
    expect(res.status).toBe(422);
    expect(res.json.details.scheduledAt).toBeTruthy();
  });
});

describe("PATCH /api/game-days/[id]", () => {
  const patch = (id: string, input: object = body) =>
    callRoute(PATCH, { method: "PATCH", params: { id }, body: input });

  it("jogador comum nao edita (403)", async () => {
    const gameDay = await createGameDay();
    await actAs(await createPlayer());
    expect((await patch(gameDay.id)).status).toBe(403);
  });

  it("pelada inexistente: 404", async () => {
    await actAs(await createAdmin());
    expect((await patch("nao-existe")).status).toBe(404);
  });

  it("organizador edita; auditoria guarda antes e depois", async () => {
    const gameDay = await createGameDay({ title: "Antes" });
    await actAs(await createAdmin());
    expect((await patch(gameDay.id, { ...body, title: "Depois", maxPlayers: 24 })).status).toBe(200);
    const after = await prisma.gameDay.findUniqueOrThrow({ where: { id: gameDay.id } });
    expect(after).toMatchObject({ title: "Depois", maxPlayers: 24 });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "GAMEDAY_UPDATED" } });
    expect((audit.before as { title: string }).title).toBe("Antes");
    expect((audit.after as { title: string }).title).toBe("Depois");
  });

  it("a partida agendada acompanha a nova duracao", async () => {
    const { gameDay } = await createTeams();
    await actAs(await createAdmin());
    await patch(gameDay.id, { ...body, teamSize: gameDay.teamSize, matchDurationSec: 900 });
    const match = await prisma.match.findFirstOrThrow({ where: { gameDayId: gameDay.id } });
    expect(match).toMatchObject({ durationMs: 900_000, remainingMs: 900_000 });
  });

  it.each([
    ["FINISHED", "Pelada encerrada não pode ser editada."],
    ["CANCELED", "Pelada cancelada não pode ser editada."],
  ] as const)("pelada %s nao e editavel (409)", async (status, message) => {
    const gameDay = await createGameDay({ status });
    await actAs(await createAdmin());
    const res = await patch(gameDay.id);
    expect(res.status).toBe(409);
    expect(res.json.error).toBe(message);
  });

  it("depois do primeiro apito o tamanho do time nao muda mais", async () => {
    const { gameDay, admin } = await startLiveGameDay();
    const match = await prisma.match.findFirstOrThrow({ where: { gameDayId: gameDay.id } });
    await prisma.match.update({ where: { id: match.id }, data: { status: "RUNNING" } });
    await actAs(admin);
    const res = await patch(gameDay.id, { ...body, teamSize: gameDay.teamSize + 1 });
    expect(res.status).toBe(409);
    expect(res.json.error).toMatch(/tamanho do time não muda mais/);
    expect((await patch(gameDay.id, { ...body, teamSize: gameDay.teamSize })).status).toBe(200);
  });
});
