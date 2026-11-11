import { GET as live } from "@/app/api/game-days/[id]/live/route";
import { GET as liveNow } from "@/app/api/game-days/live-now/route";
import { prisma } from "@/lib/prisma";
import { callRoute } from "../../helpers/route";
import {
  createAdmin,
  createGameDay,
  createPlayer,
  currentMatch,
  ensureSettings,
  scoreGoals,
  startLiveGameDay,
  whistle,
} from "../../helpers/factories";
import { actAs, asVisitor } from "../../helpers/session";

const snapshot = (id: string) => callRoute(live, { params: { id } });

describe("GET /api/game-days/[id]/live", () => {
  it("snapshot da pelada ao vivo: partida atual, escalacoes, fila e banco", async () => {
    const { gameDay, admin } = await startLiveGameDay({ players: 13 });
    const match = await currentMatch(gameDay.id);
    await whistle(match.id, admin);
    await scoreGoals(match.id, admin, "home", 1);
    await actAs(admin);

    const res = await snapshot(gameDay.id);
    expect(res.status).toBe(200);
    const body = res.json;
    expect(body.gameDay).toMatchObject({ id: gameDay.id, status: "LIVE", goalsToWin: 2 });
    expect(body.match).toMatchObject({ orderIndex: 1, status: "RUNNING", homeScore: 1, awayScore: 0 });
    expect(body.match.home.players).toHaveLength(4);
    expect(body.match.events.map((e: { type: string }) => e.type).sort()).toEqual(["ASSIST", "GOAL"]);
    expect(body.match.bench.length).toBeGreaterThan(0);
    expect(body.queue).toHaveLength(1);
    expect(body.standings).toHaveLength(3);
    expect(body.lastFinished).toBeNull();
    expect(typeof body.serverTime).toBe("number");
  });

  it("depois da primeira partida mostra o ultimo resultado com os gols e quem assistiu", async () => {
    const { gameDay, admin } = await startLiveGameDay();
    const match = await currentMatch(gameDay.id);
    await whistle(match.id, admin);
    await scoreGoals(match.id, admin, "home", 2);
    await actAs(admin);
    const { json } = await snapshot(gameDay.id);
    expect(json.lastFinished).toMatchObject({ orderIndex: 1, homeScore: 2, awayScore: 0, result: "HOME", endReason: "GOALS" });
    expect(json.lastFinished.goals).toHaveLength(2);
    expect(json.lastFinished.goals[0].assistName).toBeTruthy();
    expect(json.match.orderIndex).toBe(2);
    const standing = json.standings[0];
    expect(standing).toMatchObject({ played: 1, won: 1, goalsFor: 2 });
  });

  it("o snapshot encerra a partida cujo cronometro ja zerou", async () => {
    const { gameDay, admin } = await startLiveGameDay({ matchDurationSec: 60 });
    const match = await currentMatch(gameDay.id);
    await whistle(match.id, admin);
    await prisma.match.update({ where: { id: match.id }, data: { lastResumedAt: new Date(Date.now() - 120_000) } });
    await actAs(admin);
    const { json } = await snapshot(gameDay.id);
    expect(json.lastFinished).toMatchObject({ endReason: "TIME" });
  });

  it("pelada inexistente: 404", async () => {
    await actAs(await createPlayer());
    expect((await snapshot("fantasma")).status).toBe(404);
  });

  it("visitante assiste com o site aberto; site privado: 401; manutencao: 403", async () => {
    const { gameDay } = await startLiveGameDay();
    asVisitor();
    expect((await snapshot(gameDay.id)).status).toBe(200);
    await ensureSettings({ privateSiteEnabled: true });
    expect((await snapshot(gameDay.id)).status).toBe(401);
    await ensureSettings({ publicAccessEnabled: false });
    expect((await snapshot(gameDay.id)).status).toBe(403);
  });
});

describe("GET /api/game-days/live-now", () => {
  it("sem pelada LIVE: live null", async () => {
    await createGameDay({ status: "OPEN" });
    await createGameDay({ status: "TEAMS_SET" });
    await actAs(await createAdmin());
    expect((await callRoute(liveNow)).json).toEqual({ live: null });
  });

  it("com pelada LIVE: devolve a pelada e a partida corrente", async () => {
    const { gameDay, admin } = await startLiveGameDay();
    await actAs(admin);
    const res = await callRoute(liveNow);
    expect(res.json.live).toMatchObject({ gameDayId: gameDay.id, title: gameDay.title });
    expect(res.json.live.match).toMatchObject({ orderIndex: 1, status: "SCHEDULED", homeScore: 0 });
  });

  it("encerrada nao conta; e so para organizador", async () => {
    await createGameDay({ status: "FINISHED" });
    await actAs(await createPlayer());
    expect((await callRoute(liveNow)).status).toBe(403);
    await actAs(await createAdmin());
    expect((await callRoute(liveNow)).json.live).toBeNull();
  });

  it("com duas LIVE, a mais recente", async () => {
    const older = await startLiveGameDay({ scheduledAt: new Date("2030-01-01") });
    const newer = await startLiveGameDay({ scheduledAt: new Date("2031-01-01") });
    await actAs(older.admin);
    expect((await callRoute(liveNow)).json.live.gameDayId).toBe(newer.gameDay.id);
  });
});
