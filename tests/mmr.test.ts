import { describe, expect, it } from "vitest";
import {
  MMR,
  calibrationFactor,
  expectedRating,
  nightPerformance,
  quotaLevel,
  rateGameDay,
  stakeFactor,
  type MmrMatch,
  type MmrPlayer,
  type MmrPlayerResult,
} from "../src/lib/mmr";

// ---------------------------------------------------------------- montagem de cenarios

// Papeis so identificam quem fez o lance: a posicao nao pesa na formula (D18 = D).
type Role = "gk" | "fx" | "l1" | "l2" | "pv";
const ROLES: Role[] = ["gk", "fx", "l1", "l2", "pv"];

/** Evento do time A: quem fez e se foi gol (G) ou assistencia (A). */
type Ev = [Role, "G" | "A"];
type Row = { for: number; against: number; events: Ev[] };
type Rating = { stars: number | null; mmr: number };

const GOALS_PER_MATCH_AVERAGE = 1.1; // C-barra do cenario-base
const MATCHES_PER_NIGHT = 10;
const NEUTRAL: Rating = { stars: 3, mmr: 1000 };

/**
 * Pelada de `MATCHES_PER_NIGHT` partidas: as `rows` do time A contra o time B e o
 * resto de partidas "recheio" entre outros jogadores, so para que a media de gols
 * sofridos da pelada seja a do cenario-base (1,1). O recheio nao cruza com A e B.
 *
 * Sem `opponent`, o time B nasce com o mesmo esperado medio do time A (E = 0,5).
 */
function night(
  rows: Row[],
  options: {
    tested: Role;
    testedMmr?: number;
    testedStars?: number | null;
    teammate?: Rating;
    opponent?: Rating;
  },
): { result: MmrPlayerResult; all: MmrPlayerResult[] } {
  const teammate = options.teammate ?? NEUTRAL;
  const tested: Rating = {
    stars: options.testedStars === undefined ? 3 : options.testedStars,
    mmr: options.testedMmr ?? 1000,
  };
  const teamAverage =
    (expectedRating(teammate.stars, teammate.mmr) * 4 + expectedRating(tested.stars, tested.mmr)) / 5;
  // esperado = 0,75 x 1000 + 0,25 x mmr para quem tem 3 estrelas
  const opponent = options.opponent ?? { stars: 3, mmr: (teamAverage - 750) / MMR.EXPECTED_MMR_WEIGHT };

  const players: MmrPlayer[] = [];
  for (const role of ROLES) {
    const rating = role === options.tested ? tested : teammate;
    players.push({ userId: role, mmr: rating.mmr, stars: rating.stars, gameDaysRated: 5 });
    players.push({ userId: `b-${role}`, mmr: opponent.mmr, stars: opponent.stars, gameDaysRated: 5 });
  }
  for (const id of ["f1", "f2", "f3", "f4"]) {
    players.push({ userId: id, mmr: 1000, stars: 3, gameDaysRated: 5 });
  }

  const matches: MmrMatch[] = rows.map((row, index) => ({
    matchId: `m${index + 1}`,
    orderIndex: index + 1,
    homeTeamId: "A",
    awayTeamId: "B",
    homeScore: row.for,
    awayScore: row.against,
    result: row.for > row.against ? "HOME" : row.for < row.against ? "AWAY" : "DRAW",
    lineup: [
      ...ROLES.map((role) => ({ userId: role, teamId: "A" })),
      ...ROLES.map((role) => ({ userId: `b-${role}`, teamId: "B" })),
    ],
    events: row.events.map(([role, kind]) => ({
      userId: role,
      teamId: "A",
      type: kind === "G" ? ("GOAL" as const) : ("ASSIST" as const),
    })),
  }));

  const goalsSoFar = rows.reduce((sum, row) => sum + row.for + row.against, 0);
  const fillerCount = MATCHES_PER_NIGHT - rows.length;
  const fillerGoals = Math.round(GOALS_PER_MATCH_AVERAGE * 2 * MATCHES_PER_NIGHT) - goalsSoFar;
  for (let i = 0; i < fillerCount; i++) {
    const score = Math.floor(fillerGoals / fillerCount) + (i < fillerGoals % fillerCount ? 1 : 0);
    matches.push({
      matchId: `f${i + 1}`,
      orderIndex: 100 + i,
      homeTeamId: "C",
      awayTeamId: "D",
      homeScore: score,
      awayScore: 0,
      result: score > 0 ? "HOME" : "DRAW",
      lineup: [
        { userId: "f1", teamId: "C" },
        { userId: "f2", teamId: "C" },
        { userId: "f3", teamId: "D" },
        { userId: "f4", teamId: "D" },
      ],
      events: [],
    });
  }

  const outcome = rateGameDay({ players, matches });
  expect(outcome.skipped).toBeNull();
  const result = outcome.players.find((p) => p.userId === options.tested);
  if (!result) throw new Error("jogador testado nao saiu no resultado");
  return { result, all: outcome.players };
}

/** Os tres blocos de uma partida so, que e o que as tabelas do plano mostram. */
function blocks(result: MmrPlayerResult) {
  return {
    result: result.resultDelta,
    attack: result.attackDelta,
    defense: result.defenseDelta,
    total: Math.round((result.resultDelta + result.attackDelta + result.defenseDelta) * 100) / 100,
  };
}

function expectBlocks(
  actual: ReturnType<typeof blocks>,
  expected: { result: number; attack: number; defense: number; total: number },
) {
  expect(actual.result).toBeCloseTo(expected.result, 2);
  expect(actual.attack).toBeCloseTo(expected.attack, 2);
  expect(actual.defense).toBeCloseTo(expected.defense, 2);
  expect(actual.total).toBeCloseTo(expected.total, 2);
}

// Eventos do time A que montam o bolo B da tabela:
const POLE_ASSISTED: Ev[] = [["l1", "G"], ["fx", "A"], ["pv", "G"]]; // 2 gols, 1 assistencia (B = 2,6); l1 fez um gol
const POLE_ASSISTED_BY_L1: Ev[] = [["pv", "G"], ["l1", "A"], ["pv", "G"]]; // l1 deu a assistencia
const POLE_NOBODY: Ev[] = [["pv", "G"], ["fx", "A"], ["pv", "G"]]; // l1 sem participacao
const TWO_GOALS_L1: Ev[] = [["l1", "G"], ["l1", "G"]]; // B = 2,0

// Valores calculados a mao com as formulas da secao 0.3 do plano e conferidos por
// uma implementacao independente (esperado = 75% estrela + 25% MMR, sem peso por
// posicao): cota do jogador = 0,75 x 20% x B, defesa = 5 x (1,1 - gols sofridos).
describe("cenario-base (ala, 3 estrelas, MMR 1000, times iguais)", () => {
  const ala = (row: Row) => blocks(night([row], { tested: "l1" }).result);

  it("vitoria 2x0 e ele fez um gol", () => {
    expectBlocks(ala({ for: 2, against: 0, events: POLE_ASSISTED }), { result: 5, attack: 2.44, defense: 5.5, total: 12.94 });
  });
  it("vitoria 2x1 e ele fez os dois gols", () => {
    expectBlocks(ala({ for: 2, against: 1, events: TWO_GOALS_L1 }), { result: 5, attack: 6.8, defense: 0.5, total: 12.3 });
  });
  it("vitoria 2x1 e ele fez um gol", () => {
    expectBlocks(ala({ for: 2, against: 1, events: POLE_ASSISTED }), { result: 5, attack: 2.44, defense: 0.5, total: 7.94 });
  });
  it("vitoria 2x1 e ele deu a assistencia", () => {
    expectBlocks(ala({ for: 2, against: 1, events: POLE_ASSISTED_BY_L1 }), { result: 5, attack: 0.84, defense: 0.5, total: 6.34 });
  });
  it("vitoria 2x0 sem gol nem assistencia", () => {
    expectBlocks(ala({ for: 2, against: 0, events: POLE_NOBODY }), { result: 5, attack: -1.56, defense: 5.5, total: 8.94 });
  });
  it("vitoria 2x1 sem gol nem assistencia", () => {
    expectBlocks(ala({ for: 2, against: 1, events: POLE_NOBODY }), { result: 5, attack: -1.56, defense: 0.5, total: 3.94 });
  });
  it("empate 1x1 e ele fez o gol", () => {
    expectBlocks(ala({ for: 1, against: 1, events: [["l1", "G"]] }), { result: 0, attack: 3.4, defense: 0.5, total: 3.9 });
  });
  it("empate 1x1 sem participacao", () => {
    expectBlocks(ala({ for: 1, against: 1, events: [["pv", "G"]] }), { result: 0, attack: -0.6, defense: 0.5, total: -0.1 });
  });
  it("derrota 1x2 e ele fez o gol", () => {
    expectBlocks(ala({ for: 1, against: 2, events: [["l1", "G"]] }), { result: -5, attack: 3.4, defense: -4.5, total: -6.1 });
  });
  it("derrota 1x2 e ele deu a assistencia", () => {
    expectBlocks(ala({ for: 1, against: 2, events: [["pv", "G"], ["l1", "A"]] }), { result: -5, attack: 1.44, defense: -4.5, total: -8.06 });
  });
  it("derrota 1x2 sem participacao no gol", () => {
    expectBlocks(ala({ for: 1, against: 2, events: [["pv", "G"], ["fx", "A"]] }), { result: -5, attack: -0.96, defense: -4.5, total: -10.46 });
  });
  it("derrota 0x2, o time nao marcou", () => {
    expectBlocks(ala({ for: 0, against: 2, events: [] }), { result: -5, attack: 0, defense: -4.5, total: -9.5 });
  });
});

describe("a posicao nao pesa (D18 = D)", () => {
  it("goleiro, fixo, ala e pivo sem participar do gol tem exatamente os mesmos blocos", () => {
    const row: Row = { for: 2, against: 0, events: [["l1", "G"], ["l1", "A"], ["l1", "G"]] };
    const reference = blocks(night([row], { tested: "gk" }).result);
    expectBlocks(reference, { result: 5, attack: -1.56, defense: 5.5, total: 8.94 });
    for (const role of ["fx", "l2", "pv"] as const) {
      expect(blocks(night([row], { tested: role }).result), role).toEqual(reference);
    }
  });

  it("o goleiro que faz o gol ganha o mesmo que o ala que faz o gol", () => {
    const asGoalkeeper = blocks(night([{ for: 2, against: 0, events: [["gk", "G"], ["fx", "A"], ["pv", "G"]] }], { tested: "gk" }).result);
    const asWing = blocks(night([{ for: 2, against: 0, events: POLE_ASSISTED }], { tested: "l1" }).result);
    expect(asGoalkeeper).toEqual(asWing);
  });
});

describe("efeito do adversario (ala com um gol, 150 pontos de diferenca no esperado)", () => {
  // 5 estrelas com MMR 1000 esperam 1150; 1 estrela com MMR 1000 espera 850.
  const STRONGER: Rating = { stars: 5, mmr: 1000 };
  const WEAKER: Rating = { stars: 1, mmr: 1000 };
  const contra = (opponent: Rating, row: Row) => blocks(night([row], { tested: "l1", opponent }).result);

  it("vitoria 2x1 contra time 150 mais forte", () => {
    expectBlocks(contra(STRONGER, { for: 2, against: 1, events: POLE_ASSISTED }), { result: 8.49, attack: 2.44, defense: 0.5, total: 11.43 });
  });
  it("vitoria 2x1 contra time 150 mais fraco", () => {
    expectBlocks(contra(WEAKER, { for: 2, against: 1, events: POLE_ASSISTED }), { result: 1.51, attack: 2.44, defense: 0.5, total: 4.45 });
  });
  it("derrota 1x2 para time 150 mais forte, marcando o gol, perde menos", () => {
    expectBlocks(contra(STRONGER, { for: 1, against: 2, events: [["l1", "G"]] }), { result: -1.51, attack: 3.4, defense: -4.5, total: -2.61 });
  });
  it("derrota 1x2 para time 150 mais fraco", () => {
    expectBlocks(contra(WEAKER, { for: 1, against: 2, events: [["l1", "G"]] }), { result: -8.49, attack: 3.4, defense: -4.5, total: -9.59 });
  });
});

describe("exemplos de pelada inteira", () => {
  // A normalizacao ("ajuste") depende dos outros jogadores da noite; aqui conferimos
  // os blocos e o fator de aposta, e que o delta final obedece a ordem da secao 2.4.
  function expectDelta(result: MmrPlayerResult, stake: number) {
    expect(result.stakeFactor).toBeCloseTo(stake, 4);
    const expected =
      (result.resultDelta + result.attackDelta + result.defenseDelta + result.normalizeDelta) * stake;
    expect(result.delta).toBeCloseTo(expected, 1);
  }

  it("1. pivo 3 estrelas e MMR 1000, noite boa: 4 vitorias e 1 derrota, 4 gols e 2 assistencias", () => {
    const rows: Row[] = [
      { for: 2, against: 0, events: [["pv", "G"], ["l1", "A"], ["pv", "G"]] },
      { for: 2, against: 0, events: [["pv", "G"], ["l2", "A"], ["pv", "G"]] },
      { for: 2, against: 0, events: [["l1", "G"], ["pv", "A"], ["l2", "G"]] },
      { for: 2, against: 0, events: [["l2", "G"], ["pv", "A"], ["l1", "G"]] },
      { for: 1, against: 3, events: [["l1", "G"], ["fx", "A"]] },
    ];
    const { result } = night(rows, { tested: "pv" });
    expect(result.matches).toBe(5);
    expect(result.goals).toBe(4);
    expect(result.assists).toBe(2);
    expect(result.resultDelta).toBeCloseTo(15, 2);
    expect(result.attackDelta).toBeCloseTo(13.6, 2);
    // 4 x (+5,5) e a derrota por 3 gols travada em -7,5 pelo teto do bloco
    expect(result.defenseDelta).toBeCloseTo(14.5, 2);
    expectDelta(result, 1);
  });

  it("2. fixo 2,5 estrelas e MMR 930, noite discreta: 2 vitorias, 1 empate, 2 derrotas, 1 assistencia", () => {
    const rows: Row[] = [
      { for: 2, against: 0, events: [["pv", "G"], ["l1", "A"], ["l2", "G"]] },
      { for: 2, against: 1, events: [["pv", "G"], ["fx", "A"], ["l1", "G"]] },
      { for: 1, against: 1, events: [["l2", "G"]] },
      { for: 1, against: 2, events: [["pv", "G"], ["l1", "A"]] },
      { for: 1, against: 2, events: [["l1", "G"], ["l2", "A"]] },
    ];
    const { result } = night(rows, { tested: "fx", testedMmr: 930, testedStars: 2.5 });
    expect(result.matches).toBe(5);
    expect(result.goals).toBe(0);
    expect(result.assists).toBe(1);
    expect(result.resultDelta).toBeCloseTo(0, 2);
    expect(result.attackDelta).toBeCloseTo(-2.37, 2);
    expect(result.defenseDelta).toBeCloseTo(-2.5, 2);
    expect(result.starsUsed).toBe(2.5);
    expectDelta(result, 0.925);
  });

  it("3. goleiro 4 estrelas e MMR 1100, noite boa: 5 vitorias e 1 derrota, 3 jogos sem sofrer gol", () => {
    const rows: Row[] = [
      { for: 2, against: 0, events: [["pv", "G"], ["l1", "A"], ["l2", "G"]] },
      { for: 2, against: 0, events: [["pv", "G"], ["l1", "A"], ["l2", "G"]] },
      { for: 2, against: 0, events: [["pv", "G"], ["l1", "A"], ["l2", "G"]] },
      { for: 2, against: 1, events: [["pv", "G"], ["l1", "A"], ["l2", "G"]] },
      { for: 3, against: 1, events: [["pv", "G"], ["l1", "A"], ["l2", "G"], ["l1", "G"]] },
      { for: 1, against: 2, events: [["pv", "G"], ["fx", "A"]] },
    ];
    // O goleiro nao participa de nenhum lance e tem a cota de qualquer um: perde no ataque.
    const { result } = night(rows, { tested: "gk", testedMmr: 1100, testedStars: 4 });
    expect(result.matches).toBe(6);
    expect(result.won).toBe(5);
    expect(result.lost).toBe(1);
    expect(result.conceded).toBe(4);
    expect(result.cleanSheets).toBe(3);
    expect(result.resultDelta).toBeCloseTo(20, 2);
    expect(result.attackDelta).toBeCloseTo(-11.7, 2);
    expect(result.defenseDelta).toBeCloseTo(13, 2);
    expectDelta(result, 1.15);
  });

  it("4. pivo 5 estrelas e MMR 1200, noite ruim: 1 vitoria e 4 derrotas, 1 gol", () => {
    const rows: Row[] = [
      { for: 1, against: 0, events: [["pv", "G"], ["l1", "A"]] },
      { for: 1, against: 2, events: [["l1", "G"]] },
      { for: 1, against: 2, events: [["l2", "G"], ["fx", "A"]] },
      { for: 1, against: 2, events: [["l1", "G"]] },
      { for: 0, against: 2, events: [] },
    ];
    const { result } = night(rows, { tested: "pv", testedMmr: 1200, testedStars: 5 });
    expect(result.matches).toBe(5);
    expect(result.goals).toBe(1);
    expect(result.resultDelta).toBeCloseTo(-15, 2);
    expect(result.attackDelta).toBeCloseTo(-0.58, 2);
    expect(result.defenseDelta).toBeCloseTo(-12.5, 2);
    expectDelta(result, 1.3);
  });

  it("4b. a mesma noite custa bem menos para um pivo de 2 estrelas do que para um de 5", () => {
    const rows: Row[] = [
      { for: 1, against: 0, events: [["pv", "G"], ["l1", "A"]] },
      { for: 1, against: 2, events: [["l1", "G"]] },
      { for: 1, against: 2, events: [["l2", "G"], ["fx", "A"]] },
      { for: 1, against: 2, events: [["l1", "G"]] },
      { for: 0, against: 2, events: [] },
    ];
    const rich = night(rows, { tested: "pv", testedMmr: 1200, testedStars: 5 }).result;
    const poor = night(rows, { tested: "pv", testedMmr: 900, testedStars: 2 }).result;
    expect(poor.attackDelta).toBeCloseTo(1.76, 2); // com a cota baixa, o mesmo gol sobe
    expect(poor.stakeFactor).toBeCloseTo(0.85, 4);
    expect(Math.abs(rich.delta)).toBeGreaterThan(Math.abs(poor.delta) * 1.4);
  });

  it("5. reserva que entrou em uma partida so: vitoria 2x1 e uma assistencia", () => {
    const { result } = night([{ for: 2, against: 1, events: POLE_ASSISTED_BY_L1 }], { tested: "l1" });
    expect(result.matches).toBe(1);
    expect(result.resultDelta).toBeCloseTo(5, 2);
    expect(result.attackDelta).toBeCloseTo(0.84, 2);
    expect(result.defenseDelta).toBeCloseTo(0.5, 2);
    expectDelta(result, 1);
  });
});

describe("a estrela decide quanto o jogador anda, nos dois sentidos", () => {
  const goodNight: Row[] = [
    { for: 2, against: 0, events: [["pv", "G"], ["l1", "A"], ["pv", "G"]] },
    { for: 2, against: 0, events: [["pv", "G"], ["l2", "A"], ["pv", "G"]] },
    { for: 2, against: 0, events: [["l1", "G"], ["pv", "A"], ["l2", "G"]] },
    { for: 2, against: 0, events: [["l2", "G"], ["pv", "A"], ["l1", "G"]] },
    { for: 1, against: 3, events: [["l1", "G"], ["fx", "A"]] },
  ];
  const badNight: Row[] = [
    { for: 1, against: 0, events: [["l1", "G"]] },
    { for: 0, against: 2, events: [] },
    { for: 0, against: 2, events: [] },
    { for: 1, against: 2, events: [["l2", "G"]] },
    { for: 0, against: 2, events: [] },
  ];
  const STARS = [1, 2, 3, 4, 5];

  it("o MMR e o mesmo e so a estrela muda: o fator vira 0,70 / 0,85 / 1,00 / 1,15 / 1,30", () => {
    const factors = STARS.map((stars) => night(goodNight, { tested: "pv", testedStars: stars }).result.stakeFactor);
    expect(factors).toEqual([0.7, 0.85, 1, 1.15, 1.3]);
  });

  it("cada movimento e a soma dos blocos vezes o fator da estrela, e a estrela fica no extrato", () => {
    for (const stars of STARS) {
      const { result } = night(goodNight, { tested: "pv", testedStars: stars });
      const sum = result.resultDelta + result.attackDelta + result.defenseDelta + result.normalizeDelta;
      expect(result.delta, `${stars}★`).toBeCloseTo(sum * stakeFactor(stars), 1);
      expect(result.starsUsed).toBe(stars);
    }
  });

  it("na noite boa quem tem mais estrelas sobe mais; na ruim, cai mais", () => {
    const up = STARS.map((stars) => night(goodNight, { tested: "pv", testedStars: stars }).result.delta);
    const down = STARS.map((stars) => night(badNight, { tested: "pv", testedStars: stars }).result.delta);
    for (let i = 1; i < STARS.length; i++) {
      expect(up[i], `sobe ${STARS[i]}★ > ${STARS[i - 1]}★`).toBeGreaterThan(up[i - 1]);
      expect(down[i], `cai ${STARS[i]}★ < ${STARS[i - 1]}★`).toBeLessThan(down[i - 1]);
    }
    expect(up[0]).toBeGreaterThan(0);
    expect(down[0]).toBeLessThan(0);
  });

  it("sem estrela anda no ritmo neutro e o extrato diz que nao havia", () => {
    const { result } = night(goodNight, { tested: "pv", testedStars: null });
    expect(result.stakeFactor).toBe(1);
    expect(result.starsUsed).toBeNull();
    // e igual a 3 estrelas em tudo: o esperado tambem trata a falta como o centro
    const neutral = night(goodNight, { tested: "pv", testedStars: 3 }).result;
    expect(result.delta).toBe(neutral.delta);
  });

  it("meia estrela conta: 4,5 estrelas dao fator 1,225", () => {
    const { result } = night(goodNight, { tested: "pv", testedStars: 4.5 });
    expect(result.stakeFactor).toBeCloseTo(1.225, 4);
    expect(result.starsUsed).toBe(4.5);
  });
});

// ---------------------------------------------------------------- propriedades da pelada

function smallNight(): { players: MmrPlayer[]; matches: MmrMatch[] } {
  const rated = (userId: string): MmrPlayer => ({ userId, mmr: 1000, stars: 3, gameDaysRated: 3 });
  const players: MmrPlayer[] = ["a1", "a2", "a3", "b1", "b2", "b3", "reserva"].map(rated);
  const lineup = [
    ...["a1", "a2", "a3"].map((userId) => ({ userId, teamId: "A" })),
    ...["b1", "b2", "b3"].map((userId) => ({ userId, teamId: "B" })),
  ];
  const matches: MmrMatch[] = [
    {
      matchId: "m1",
      orderIndex: 1,
      homeTeamId: "A",
      awayTeamId: "B",
      homeScore: 2,
      awayScore: 1,
      result: "HOME",
      lineup,
      events: [
        { userId: "a1", teamId: "A", type: "GOAL" },
        { userId: "a2", teamId: "A", type: "ASSIST" },
        { userId: "a1", teamId: "A", type: "GOAL" },
        { userId: "b2", teamId: "B", type: "GOAL" },
      ],
    },
    {
      matchId: "m2",
      orderIndex: 2,
      homeTeamId: "A",
      awayTeamId: "B",
      homeScore: 0,
      awayScore: 2,
      result: "AWAY",
      lineup,
      events: [
        { userId: "b1", teamId: "B", type: "GOAL" },
        { userId: "b2", teamId: "B", type: "ASSIST" },
        { userId: "b2", teamId: "B", type: "GOAL" },
      ],
    },
  ];
  return { players, matches };
}

describe("propriedades da pelada", () => {
  it("a soma dos blocos mais o ajuste da pelada e zero (normalizacao)", () => {
    const { all } = night(
      [
        { for: 2, against: 0, events: POLE_ASSISTED },
        { for: 1, against: 2, events: [["l1", "G"]] },
        { for: 2, against: 2, events: [["pv", "G"], ["l2", "G"]] },
      ],
      { tested: "l1" },
    );
    const sum = all.reduce((acc, p) => acc + p.resultDelta + p.attackDelta + p.defenseDelta + p.normalizeDelta, 0);
    expect(Math.abs(sum)).toBeLessThan(0.1);
  });

  it("com todos na mesma estrela o fator e 1 e a soma dos movimentos tambem e zero", () => {
    const { players, matches } = smallNight();
    const out = rateGameDay({ players, matches });
    const sum = out.players.reduce((acc, p) => acc + p.delta, 0);
    expect(Math.abs(sum)).toBeLessThan(0.1);
  });

  it("reserva sem linha na escalacao nao aparece no resultado", () => {
    const { players, matches } = smallNight();
    const out = rateGameDay({ players, matches });
    expect(out.players.map((p) => p.userId).sort()).toEqual(["a1", "a2", "a3", "b1", "b2", "b3"]);
    expect(out.players.find((p) => p.userId === "reserva")).toBeUndefined();
  });

  it("pelada com uma partida so conta (D13 = B)", () => {
    const { players, matches } = smallNight();
    const out = rateGameDay({ players, matches: [matches[0]] });
    expect(out.skipped).toBeNull();
    expect(out.players).toHaveLength(6);
  });

  it("pelada sem nenhuma partida avaliavel devolve skipped e ninguem se mexe", () => {
    const { players, matches } = smallNight();
    expect(rateGameDay({ players, matches: [] })).toMatchObject({ skipped: expect.any(String), players: [] });
    // partida sem escalacao no time visitante tambem nao conta
    const semEscalacao = { ...matches[0], lineup: matches[0].lineup.filter((row) => row.teamId === "A") };
    expect(rateGameDay({ players, matches: [semEscalacao] }).skipped).not.toBeNull();
  });

  it("partida de 0x0 nao divide por zero: ataque zerado e defesa neutra", () => {
    const { players, matches } = smallNight();
    const zero: MmrMatch = { ...matches[0], homeScore: 0, awayScore: 0, result: "DRAW", events: [] };
    const out = rateGameDay({ players, matches: [zero] });
    for (const p of out.players) {
      expect(Number.isFinite(p.delta)).toBe(true);
      expect(p.attackDelta).toBe(0);
      expect(p.defenseDelta).toBe(0);
    }
  });

  it("result nulo conta como empate", () => {
    const { players, matches } = smallNight();
    const withNull = { ...matches[0], result: null };
    const out = rateGameDay({ players, matches: [withNull] });
    expect(out.players.find((p) => p.userId === "a1")?.drawn).toBe(1);
  });

  it("jogador nos dois times fica no mandante", () => {
    const { players, matches } = smallNight();
    const dup = { ...matches[0], lineup: [...matches[0].lineup, { userId: "a1", teamId: "B" }] };
    const out = rateGameDay({ players, matches: [dup] });
    expect(out.players.find((p) => p.userId === "a1")?.matches).toBe(1);
  });

  it("jogador fora da lista de entrada entra no centro, sem estrela", () => {
    const { players, matches } = smallNight();
    const out = rateGameDay({ players: players.filter((p) => p.userId !== "a3"), matches });
    const stray = out.players.find((p) => p.userId === "a3");
    expect(stray?.mmrBefore).toBe(MMR.BASE);
    expect(stray?.starsUsed).toBeNull();
    expect(stray?.stakeFactor).toBe(1);
  });

  it("teto de 60 por pelada: uma noite perfeita nao passa de +60", () => {
    const events: Ev[] = [["l1", "G"], ["l1", "G"], ["l1", "G"], ["l1", "G"], ["l1", "G"]];
    const rows: Row[] = Array.from({ length: 10 }, () => ({ for: 5, against: 0, events }));
    const { result } = night(rows, { tested: "l1" });
    expect(result.delta).toBe(MMR.GAMEDAY_CAP);
    expect(result.capped).toBe(true);
  });

  it("o MMR novo respeita o piso e o teto da escala", () => {
    const { players, matches } = smallNight();
    const out = rateGameDay({
      players: players.map((p) => ({ ...p, mmr: p.userId.startsWith("a") ? MMR.MIN : MMR.MAX })),
      matches,
    });
    for (const p of out.players) {
      expect(p.mmrAfter).toBeGreaterThanOrEqual(MMR.MIN);
      expect(p.mmrAfter).toBeLessThanOrEqual(MMR.MAX);
    }
  });

  it("e deterministica: mesma entrada, mesma saida", () => {
    const { players, matches } = smallNight();
    const first = rateGameDay({ players, matches });
    const second = rateGameDay({ players: [...players].reverse(), matches: [...matches].reverse() });
    const byUser = (r: typeof first) => Object.fromEntries(r.players.map((p) => [p.userId, p]));
    expect(byUser(second)).toEqual(byUser(first));
    expect(rateGameDay({ players, matches })).toEqual(first);
  });
});

describe("MVP da pelada (D25)", () => {
  it("sai do desempenho antes do fator de aposta, nao do movimento final", () => {
    // a1 (5 estrelas) so da uma assistencia; a2 e a3 (1 estrela) fazem um gol cada. Os
    // dois rendem mais que o a1, mas o fator 1,30 do a1 contra 0,70 deles deixa o
    // movimento final do a1 maior. No empate de desempenho, o userId menor (a2).
    const { players, matches } = smallNight();
    const rated = players.map((p) => ({
      ...p,
      stars: p.userId === "a1" ? 5 : p.userId === "a2" || p.userId === "a3" ? 1 : 3,
    }));
    const win: MmrMatch = {
      ...matches[0],
      homeScore: 2,
      awayScore: 0,
      result: "HOME",
      events: [
        { userId: "a2", teamId: "A", type: "GOAL" },
        { userId: "a1", teamId: "A", type: "ASSIST" },
        { userId: "a3", teamId: "A", type: "GOAL" },
      ],
    };
    const out = rateGameDay({ players: rated, matches: [win] });
    const a1 = out.players.find((p) => p.userId === "a1")!;
    const a2 = out.players.find((p) => p.userId === "a2")!;
    expect(nightPerformance(a2)).toBeGreaterThan(nightPerformance(a1));
    expect(a1.delta).toBeGreaterThan(a2.delta);
    expect(out.mvpUserId).toBe("a2");
    // nenhum outro jogador tem desempenho melhor que o do MVP
    for (const player of out.players) {
      expect(nightPerformance(player)).toBeLessThanOrEqual(nightPerformance(a2));
    }
  });

  it("no empate de desempenho, o userId menor", () => {
    const { players, matches } = smallNight();
    const out = rateGameDay({ players, matches: [{ ...matches[0], events: [] }] });
    // sem gols nem assistencias o time vencedor inteiro rende igual
    expect(out.mvpUserId).toBe("a1");
  });

  it("sem desempenho positivo ninguem e MVP", () => {
    const { players, matches } = smallNight();
    const zero: MmrMatch = { ...matches[0], homeScore: 0, awayScore: 0, result: "DRAW", events: [] };
    expect(rateGameDay({ players, matches: [zero] }).mvpUserId).toBeNull();
  });

  it("nightPerformance soma os quatro blocos", () => {
    expect(nightPerformance({ resultDelta: 5, attackDelta: -1.56, defenseDelta: 5.5, normalizeDelta: -2.4 })).toBe(6.54);
  });
});

// ---------------------------------------------------------------- esperado, cota e fator

describe("esperado de cada jogador (D18 = D)", () => {
  it("a estrela pesa 75% e o MMR 25%", () => {
    expect(expectedRating(3, 1000)).toBe(1000);
    expect(expectedRating(5, 1000)).toBe(1150);
    expect(expectedRating(1, 1000)).toBe(850);
    expect(expectedRating(3, 1200)).toBe(1050);
    expect(expectedRating(1, 1200)).toBe(900); // o MMR alto nao compensa a estrela baixa
  });

  it("uma estrela a mais move o esperado em 75 pontos; cem pontos de MMR a mais, em 25", () => {
    const perStar = expectedRating(4, 1000) - expectedRating(3, 1000);
    const perMmrHundred = expectedRating(3, 1100) - expectedRating(3, 1000);
    expect(perStar).toBe(75);
    expect(perMmrHundred).toBe(25);
  });

  it("sem estrela vale o centro, como 3 estrelas", () => {
    expect(expectedRating(null, 1000)).toBe(expectedRating(3, 1000));
    expect(expectedRating(null, 900)).toBe(expectedRating(3, 900));
  });

  it("a cota de ataque vai de 1/3 a 5/3 e para de crescer fora de 800 a 1200", () => {
    expect(quotaLevel(1000)).toBe(1);
    expect(quotaLevel(800)).toBeCloseTo(1 / 3, 10);
    expect(quotaLevel(1200)).toBeCloseTo(5 / 3, 10);
    expect(quotaLevel(600)).toBeCloseTo(1 / 3, 10);
    expect(quotaLevel(1600)).toBeCloseTo(5 / 3, 10);
    expect(quotaLevel(1150)).toBeCloseTo(1.5, 10);
  });
});

describe("fator de aposta e calibracao", () => {
  it("0,70 em 1 estrela e 1,30 em 5, passo de 0,15 por estrela", () => {
    expect(stakeFactor(1)).toBe(0.7);
    expect(stakeFactor(1.5)).toBe(0.775);
    expect(stakeFactor(2)).toBe(0.85);
    expect(stakeFactor(2.5)).toBe(0.925);
    expect(stakeFactor(3)).toBe(1);
    expect(stakeFactor(3.5)).toBe(1.075);
    expect(stakeFactor(4)).toBe(1.15);
    expect(stakeFactor(4.5)).toBe(1.225);
    expect(stakeFactor(5)).toBe(1.3);
  });

  it("sem estrela e 1,00 e fora da escala trava em 0,70 e 1,30", () => {
    expect(stakeFactor(null)).toBe(1);
    expect(stakeFactor(0)).toBe(0.7);
    expect(stakeFactor(7)).toBe(1.3);
  });

  it("sem calibracao (D4 = B) o multiplicador e sempre 1", () => {
    expect(calibrationFactor(0)).toBe(1);
    expect(calibrationFactor(10)).toBe(1);
  });
});
