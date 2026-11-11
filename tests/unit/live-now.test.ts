import { describe, expect, it } from "vitest";
import { dismissKey, isInterval, shouldShowLiveNow, type LiveNow } from "../src/lib/live-now";

function liveNow(overrides: Partial<LiveNow> = {}): LiveNow {
  return {
    gameDayId: "gd1",
    title: "Pelada de quinta",
    match: {
      id: "m3",
      orderIndex: 3,
      status: "RUNNING",
      homeName: "A",
      awayName: "B",
      homeScore: 1,
      awayScore: 0,
    },
    ...overrides,
  };
}

describe("isInterval", () => {
  it("partida rolando ou pausada nao e intervalo", () => {
    expect(isInterval(liveNow())).toBe(false);
    const paused = liveNow();
    paused.match!.status = "PAUSED";
    expect(isInterval(paused)).toBe(false);
  });

  it("proxima partida pronta ou sem partida montada e intervalo", () => {
    const scheduled = liveNow();
    scheduled.match!.status = "SCHEDULED";
    expect(isInterval(scheduled)).toBe(true);
    expect(isInterval(liveNow({ match: null }))).toBe(true);
  });
});

describe("dismissKey", () => {
  it("muda de partida para partida e entre peladas", () => {
    const third = liveNow();
    const fourth = liveNow();
    fourth.match!.id = "m4";
    expect(dismissKey(third)).toBe("gd1:m3");
    expect(dismissKey(fourth)).toBe("gd1:m4");
    expect(dismissKey(liveNow({ gameDayId: "gd2" }))).not.toBe(dismissKey(third));
  });

  it("sem partida usa a marca de intervalo", () => {
    expect(dismissKey(liveNow({ match: null }))).toBe("gd1:intervalo");
  });
});

describe("shouldShowLiveNow", () => {
  it("nada ao vivo, nada para mostrar", () => {
    expect(shouldShowLiveNow(null, "/ranking", null)).toBe(false);
  });

  it("aparece fora do painel", () => {
    expect(shouldShowLiveNow(liveNow(), "/ranking", null)).toBe(true);
    expect(shouldShowLiveNow(liveNow(), "/game-days/gd1", null)).toBe(true);
    expect(shouldShowLiveNow(liveNow(), "/game-days/gd1/live", null)).toBe(true);
  });

  it("some dentro do painel da propria pelada, mas nao no de outra", () => {
    expect(shouldShowLiveNow(liveNow(), "/game-days/gd1/panel", null)).toBe(false);
    expect(shouldShowLiveNow(liveNow(), "/game-days/outra/panel", null)).toBe(true);
  });

  it("fechado, fica escondido na mesma partida e volta na seguinte", () => {
    const dismissed = dismissKey(liveNow());
    expect(shouldShowLiveNow(liveNow(), "/ranking", dismissed)).toBe(false);

    const next = liveNow();
    next.match!.id = "m4";
    next.match!.status = "SCHEDULED";
    expect(shouldShowLiveNow(next, "/ranking", dismissed)).toBe(true);
  });

  it("fechado no intervalo sem partida, volta quando a partida nasce", () => {
    const dismissed = dismissKey(liveNow({ match: null }));
    expect(shouldShowLiveNow(liveNow({ match: null }), "/ranking", dismissed)).toBe(false);
    expect(shouldShowLiveNow(liveNow(), "/ranking", dismissed)).toBe(true);
  });
});
