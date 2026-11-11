import { GET as ficha } from "@/app/api/players/[id]/route";
import { PATCH as evaluate } from "@/app/api/players/[id]/evaluation/route";
import { PATCH as adjust } from "@/app/api/players/[id]/mmr/route";
import { prisma } from "@/lib/prisma";
import { callRoute } from "../../helpers/route";
import { createAdmin, createPlayer, createSuperadmin, createUser, ensureSettings, finishGameDay } from "../../helpers/factories";
import { actAs, asVisitor } from "../../helpers/session";

describe("GET /api/players/[id] (ficha publica)", () => {
  it("devolve o perfil sem e-mail nem papel, e visitante pode ver com o site aberto", async () => {
    const player = await createPlayer({ username: "craque", profile: { name: "Craque", nickname: "CR7", position: "PIVO", foot: "LEFT" } });
    asVisitor();
    const res = await callRoute(ficha, { params: { id: player.id } });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      userId: player.id,
      name: "Craque",
      nickname: "CR7",
      position: "PIVO",
      positionLabel: "Pivô",
      footLabel: "Canhoto",
      stats: { goals: 0, assists: 0, played: 0, won: 0, winRate: 0 },
      rating: null,
    });
    const text = JSON.stringify(res.json);
    expect(text).not.toContain(player.email);
    expect(res.json).not.toHaveProperty("role");
    expect(res.json).not.toHaveProperty("email");
  });

  it("jogador sem perfil: 404", async () => {
    const user = await createUser({ profile: false });
    asVisitor();
    expect((await callRoute(ficha, { params: { id: user.id } })).status).toBe(404);
    expect((await callRoute(ficha, { params: { id: "fantasma" } })).status).toBe(404);
  });

  it("site privado: visitante recebe 401", async () => {
    const player = await createPlayer();
    await ensureSettings({ privateSiteEnabled: true });
    asVisitor();
    expect((await callRoute(ficha, { params: { id: player.id } })).status).toBe(401);
  });

  it("depois de uma pelada encerrada traz estatisticas e o MMR com historico", async () => {
    const { players } = await finishGameDay();
    const scorer = await prisma.matchEvent.findFirstOrThrow({ where: { type: "GOAL" } });
    asVisitor();
    const res = await callRoute(ficha, { params: { id: scorer.userId } });
    expect(res.json.stats.goals).toBeGreaterThan(0);
    expect(res.json.stats.played).toBeGreaterThan(0);
    expect(res.json.rating).toMatchObject({ gameDays: 1 });
    expect(res.json.rating.rank).toBeGreaterThanOrEqual(1);
    expect(res.json.rating.history).toHaveLength(1);
    expect(players.length).toBe(12);
  });
});

describe("PATCH /api/players/[id]/evaluation (estrelas)", () => {
  const rate = (id: string, stars: number | null) =>
    callRoute(evaluate, { method: "PATCH", params: { id }, body: { stars } });

  it("so organizador avalia (403 para jogador, inclusive o proprio)", async () => {
    const player = await createPlayer();
    await actAs(player);
    expect((await rate(player.id, 5)).status).toBe(403);
  });

  it("grava as estrelas, a data e a auditoria com antes e depois", async () => {
    const player = await createPlayer({ profile: { stars: 2 } });
    await actAs(await createAdmin());
    expect((await rate(player.id, 4.5)).status).toBe(200);
    const profile = await prisma.playerProfile.findUniqueOrThrow({ where: { userId: player.id } });
    expect(profile.stars).toBe(4.5);
    expect(profile.starsUpdatedAt).not.toBeNull();
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "PLAYER_STARS_SET" } });
    expect(audit.before).toEqual({ stars: 2 });
    expect(audit.after).toEqual({ stars: 4.5 });
  });

  it("repetir a mesma nota nao audita de novo", async () => {
    const player = await createPlayer({ profile: { stars: 3 } });
    await actAs(await createAdmin());
    await rate(player.id, 4);
    await rate(player.id, 4);
    expect(await prisma.auditLog.count({ where: { action: "PLAYER_STARS_SET" } })).toBe(1);
  });

  // BUG (docs/verificacao-testes/relatorio.md, "Bugs encontrados"): starsSchema usa
  // z.union([z.coerce.number(), z.null()]) e a coercao engole o null (Number(null) = 0),
  // que a faixa 1..5 recusa. O ramo "tirar a nota" da rota nunca roda. Nao corrigido aqui.
  it.failing("tirar a nota (null) apaga a nota e a data", async () => {
    const player = await createPlayer({ profile: { stars: 3 } });
    await actAs(await createAdmin());
    expect((await rate(player.id, null)).status).toBe(200);
    expect(await prisma.playerProfile.findUniqueOrThrow({ where: { userId: player.id } })).toMatchObject({ stars: null, starsUpdatedAt: null });
  });

  it.each([0, 5.5, 3.3, "muitas"])("valor invalido %s: 422", async (value) => {
    const player = await createPlayer();
    await actAs(await createAdmin());
    const res = await callRoute(evaluate, { method: "PATCH", params: { id: player.id }, body: { stars: value } });
    expect(res.status).toBe(422);
  });

  it("jogador sem perfil: 404", async () => {
    const user = await createUser({ profile: false });
    await actAs(await createAdmin());
    expect((await rate(user.id, 3)).status).toBe(404);
  });
});

describe("PATCH /api/players/[id]/mmr (ajuste manual)", () => {
  const set = (id: string, body: object) => callRoute(adjust, { method: "PATCH", params: { id }, body });

  it("so o superadmin (organizador recebe 403)", async () => {
    const { players } = await finishGameDay();
    await actAs(await createAdmin());
    expect((await set(players[0].id, { mmr: 1100, reason: "correcao de teste" })).status).toBe(403);
  });

  it("ajusta o MMR, atualiza pico e piso e audita com o motivo", async () => {
    await finishGameDay();
    const rating = await prisma.playerRating.findFirstOrThrow();
    await actAs(await createSuperadmin());
    const res = await set(rating.userId, { mmr: 1500.04, reason: "correcao de teste" });
    expect(res.status).toBe(200);
    const after = await prisma.playerRating.findUniqueOrThrow({ where: { userId: rating.userId } });
    expect(after.mmr).toBe(1500);
    expect(after.peakMmr).toBe(1500);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "RATING_ADJUSTED" } });
    expect(audit.after).toEqual({ mmr: 1500, reason: "correcao de teste" });
  });

  it("fora da faixa 600..1600 ou sem motivo: 422; sem MMR: 404", async () => {
    const player = await createPlayer();
    await actAs(await createSuperadmin());
    expect((await set(player.id, { mmr: 1700, reason: "correcao de teste" })).status).toBe(422);
    expect((await set(player.id, { mmr: 1000, reason: "x" })).status).toBe(422);
    expect((await set(player.id, { mmr: 1000, reason: "correcao de teste" })).status).toBe(404);
  });
});
