import { GET } from "@/app/api/game-days/[id]/stream/route";
import { publishGameDay } from "@/lib/realtime";
import { readSse } from "../../helpers/route";
import { createPlayer, ensureSettings, startLiveGameDay } from "../../helpers/factories";
import { actAs, asVisitor } from "../../helpers/session";

function open(id: string, signal?: AbortSignal) {
  return GET(
    Object.assign(new Request(`http://localhost:3100/api/game-days/${id}/stream`, { signal }), {}),
    { params: Promise.resolve({ id }) },
  );
}

describe("GET /api/game-days/[id]/stream (SSE)", () => {
  it("o primeiro evento e o snapshot", async () => {
    const { gameDay } = await startLiveGameDay();
    const controller = new AbortController();
    const response = await open(gameDay.id, controller.signal);
    expect(response.headers.get("content-type")).toMatch(/text\/event-stream/);
    const [first] = await readSse(response, 1);
    controller.abort();
    expect(first.event).toBe("snapshot");
    expect(first.data.gameDay.id).toBe(gameDay.id);
  });

  it("uma mudanca publicada empurra um novo snapshot", async () => {
    const { gameDay } = await startLiveGameDay();
    const controller = new AbortController();
    const response = await open(gameDay.id, controller.signal);
    const pending = readSse(response, 2);
    await new Promise((resolve) => setTimeout(resolve, 150));
    publishGameDay(gameDay.id, "teste");
    const events = await pending;
    controller.abort();
    expect(events.map((e) => e.event)).toEqual(["snapshot", "snapshot"]);
  });

  it("pelada inexistente: o stream avisa com evento de erro, nao quebra", async () => {
    await actAs(await createPlayer());
    const controller = new AbortController();
    const [first] = await readSse(await open("fantasma", controller.signal), 1);
    controller.abort();
    expect(first.event).toBe("erro");
  });

  it("visitante entra com o site aberto; site privado: 401", async () => {
    const { gameDay } = await startLiveGameDay();
    asVisitor();
    const controller = new AbortController();
    const [first] = await readSse(await open(gameDay.id, controller.signal), 1);
    controller.abort();
    expect(first.event).toBe("snapshot");

    await ensureSettings({ privateSiteEnabled: true });
    expect((await open(gameDay.id)).status).toBe(401);
  });

  it("manutencao bloqueia o stream (403)", async () => {
    const { gameDay } = await startLiveGameDay();
    await ensureSettings({ publicAccessEnabled: false });
    asVisitor();
    expect((await open(gameDay.id)).status).toBe(403);
  });
});
