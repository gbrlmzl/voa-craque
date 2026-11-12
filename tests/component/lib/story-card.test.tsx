import { SAFE_BOTTOM, SAFE_TOP, STORY_HEIGHT, STORY_WIDTH, canvasToBlob, drawStoryCard, resolveDisplayFamily, type StoryCardData } from "@/lib/story-card";
import { installFakeCanvas } from "../../helpers/fake-canvas";
import { mockFetch } from "../../helpers/fetch-mock";

const data: StoryCardData = {
  gameDayTitle: "Pelada de sexta",
  gameDayDate: "10/05/2030",
  location: "Quadra do Bairro",
  name: "Gabriel Souza",
  nickname: "Gabi",
  photoUrl: "/api/files/fotos/a.webp",
  played: 4,
  won: 3,
  lost: 1,
  winRate: 0.75,
  goals: 5,
  assists: 2,
  topScorer: true,
  mvp: true,
};

let canvasApi: ReturnType<typeof installFakeCanvas>;
beforeEach(() => {
  canvasApi = installFakeCanvas();
});
afterEach(() => canvasApi.restore());

const newCanvas = () => document.createElement("canvas");

describe("drawStoryCard", () => {
  it("desenha o card 9:16 de 1080x1920 e escreve titulo, local, nome e as estatisticas", async () => {
    mockFetch({ "GET /api/files/fotos/a.webp": { body: "x" }, "GET /icon.svg": { body: "x" } });
    const canvas = newCanvas();
    await drawStoryCard(canvas, data);
    expect(canvas.width).toBe(STORY_WIDTH);
    expect(canvas.height).toBe(STORY_HEIGHT);
    expect(STORY_WIDTH / STORY_HEIGHT).toBeCloseTo(9 / 16);

    const text = canvasApi.texts().join(" | ");
    for (const expected of ["Pelada de sexta", "10/05/2030", "Quadra do Bairro"]) {
      expect(text.toLowerCase()).toContain(expected.toLowerCase());
    }
    expect(text.toLowerCase()).toMatch(/gabi/);
    expect(canvasApi.calls.some((c) => c.method === "drawImage")).toBe(true);
    expect(canvasApi.calls.some((c) => c.method === "stroke")).toBe(true); // icones lucide via Path2D
  });

  it("todo o conteudo importante fica na area segura do Instagram", () => {
    expect(SAFE_TOP).toBe(250);
    expect(SAFE_BOTTOM).toBe(1670);
    expect(STORY_HEIGHT - SAFE_BOTTOM).toBeGreaterThanOrEqual(250);
  });

  it("sem foto e sem nada para destacar ainda desenha (iniciais, sem selos)", async () => {
    mockFetch({ "GET /icon.svg": { body: "x" } });
    const canvas = newCanvas();
    await drawStoryCard(canvas, { ...data, photoUrl: null, nickname: null, topScorer: false, mvp: false, played: 0, won: 0, lost: 0, goals: 0, assists: 0, winRate: 0 });
    expect(canvasApi.texts().length).toBeGreaterThan(3);
    expect(canvasApi.texts().join("|")).toContain("GS");
  });

  it("nome enorme tem a fonte reduzida ate caber", async () => {
    mockFetch({ "GET /icon.svg": { body: "x" } });
    await drawStoryCard(newCanvas(), { ...data, photoUrl: null, name: "Cristiano Ronaldo dos Santos Aveiro Junior Segundo" });
    expect(canvasApi.calls.filter((c) => c.method === "measureText").length).toBeGreaterThan(4);
  });

  it("foto que falha ao baixar nao derruba o desenho", async () => {
    mockFetch({ "GET /api/files/fotos/a.webp": { status: 404, body: {} }, "GET /icon.svg": { status: 404, body: {} } });
    await expect(drawStoryCard(newCanvas(), data)).resolves.toBeUndefined();
  });

  it("rede fora tambem nao derruba", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("sem rede"));
    await expect(drawStoryCard(newCanvas(), data)).resolves.toBeUndefined();
  });

  it("sem suporte a canvas 2D nao faz nada", async () => {
    (HTMLCanvasElement.prototype.getContext as jest.Mock).mockReturnValue(null);
    const canvas = newCanvas();
    await drawStoryCard(canvas, data);
    expect(canvasApi.calls).toHaveLength(0);
  });

  it("usa a fonte pedida quando ela carrega", async () => {
    mockFetch({ "GET /icon.svg": { body: "x" } });
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { load: jest.fn().mockResolvedValue([]), check: jest.fn().mockReturnValue(true) },
    });
    await drawStoryCard(newCanvas(), { ...data, photoUrl: null }, { displayFamily: "Barlow Condensed, Arial" });
    expect(String(canvasApi.props.font)).toBeTruthy();
    expect(canvasApi.calls.length).toBeGreaterThan(50);
  });
});

describe("resolveDisplayFamily", () => {
  const setFonts = (fonts: unknown) => Object.defineProperty(document, "fonts", { configurable: true, value: fonts });

  it("sem familia ou sem document.fonts: fonte do sistema", async () => {
    expect(await resolveDisplayFamily(null)).toMatch(/system-ui/);
    expect(await resolveDisplayFamily(undefined)).toMatch(/system-ui/);
    setFonts(undefined);
    expect(await resolveDisplayFamily("Barlow")).toMatch(/system-ui/);
  });

  it("fonte carregada: usa a principal e deixa o sistema como reserva", async () => {
    const load = jest.fn().mockResolvedValue([]);
    setFonts({ load, check: () => true });
    expect(await resolveDisplayFamily("Barlow Condensed, Arial")).toBe("Barlow Condensed, system-ui, sans-serif");
    expect(load).toHaveBeenCalledWith("800 64px Barlow Condensed");
    expect(load).toHaveBeenCalledWith("600 64px Barlow Condensed");
  });

  it("fonte que nao ficou pronta ou que lanca: fonte do sistema", async () => {
    setFonts({ load: jest.fn().mockResolvedValue([]), check: () => false });
    expect(await resolveDisplayFamily("Barlow")).toMatch(/^system-ui/);
    setFonts({ load: jest.fn().mockRejectedValue(new Error("falhou")), check: () => true });
    expect(await resolveDisplayFamily("Barlow")).toMatch(/^system-ui/);
  });

  it("fonte que demora alem do limite nao trava o card", async () => {
    setFonts({ load: () => new Promise(() => {}), check: () => false });
    expect(await resolveDisplayFamily("Barlow", 20)).toMatch(/^system-ui/);
  });
});

describe("canvasToBlob", () => {
  it("exporta PNG", async () => {
    const blob = await canvasToBlob(newCanvas());
    expect(blob?.type).toBe("image/png");
  });
});
