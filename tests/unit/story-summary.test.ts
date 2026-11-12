import { pickBadges, pickHeadline } from "../../src/lib/story-summary";

describe("pickHeadline", () => {
  it("destaca os gols quando fez pelo menos um", () => {
    expect(pickHeadline({ played: 5, won: 3, goals: 3, winRate: 0.6 })).toEqual({
      value: "3",
      label: "GOLS NA PELADA",
      secondary: "60% de aproveitamento",
    });
  });

  it("um gol fica no singular", () => {
    expect(pickHeadline({ played: 4, won: 1, goals: 1, winRate: 0.25 })).toMatchObject({
      value: "1",
      label: "GOL NA PELADA",
    });
  });

  it("sem gol, destaca as vitorias", () => {
    expect(pickHeadline({ played: 4, won: 2, goals: 0, winRate: 0.5 })).toEqual({
      value: "2",
      label: "VITÓRIAS",
      secondary: "50% de aproveitamento",
    });
    expect(pickHeadline({ played: 4, won: 1, goals: 0, winRate: 0.25 })).toMatchObject({
      value: "1",
      label: "VITÓRIA",
    });
  });

  it("sem gol e sem vitoria, destaca as partidas jogadas e nao mostra 0%", () => {
    const headline = pickHeadline({ played: 3, won: 0, goals: 0, winRate: 0 });
    expect(headline).toEqual({ value: "3", label: "PARTIDAS JOGADAS", secondary: null });
    expect(JSON.stringify(headline)).not.toContain("0%");
    expect(pickHeadline({ played: 1, won: 0, goals: 0, winRate: 0 })).toMatchObject({
      value: "1",
      label: "PARTIDA JOGADA",
    });
  });

  it("fez gol mas nao venceu: sem linha de aproveitamento", () => {
    expect(pickHeadline({ played: 3, won: 0, goals: 2, winRate: 0 })).toEqual({
      value: "2",
      label: "GOLS NA PELADA",
      secondary: null,
    });
  });
});

describe("pickBadges", () => {
  const base = { played: 5, lost: 1, mvp: false, topScorer: false };

  it("sem nada, sem selo", () => {
    expect(pickBadges(base)).toEqual([]);
  });

  it("MVP vem antes do artilheiro", () => {
    expect(pickBadges({ ...base, mvp: true, topScorer: true })).toEqual(["MVP", "TOP_SCORER"]);
  });

  it("invicto precisa de pelo menos 2 partidas e nenhuma derrota", () => {
    expect(pickBadges({ ...base, played: 4, lost: 0 })).toEqual(["UNBEATEN"]);
    expect(pickBadges({ ...base, played: 1, lost: 0 })).toEqual([]);
    expect(pickBadges({ ...base, played: 2, lost: 0 })).toEqual(["UNBEATEN"]);
    expect(pickBadges({ ...base, played: 4, lost: 1 })).toEqual([]);
  });

  it("corta em 2 selos, mantendo a ordem de prioridade", () => {
    expect(pickBadges({ played: 4, lost: 0, mvp: true, topScorer: true })).toEqual(["MVP", "TOP_SCORER"]);
    expect(pickBadges({ played: 4, lost: 0, mvp: false, topScorer: true })).toEqual(["TOP_SCORER", "UNBEATEN"]);
  });
});
