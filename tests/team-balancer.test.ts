import { describe, expect, it } from "vitest";
import {
  BalanceError,
  balanceTeams,
  computeStrength,
  median,
  ratePlayers,
  type BalancerPlayer,
  type BalancerPosition,
} from "@/lib/team-balancer";

function makePlayer(
  index: number,
  overrides: Partial<BalancerPlayer> = {},
): BalancerPlayer {
  return {
    userId: `u${index}`,
    name: `Jogador ${index}`,
    stars: 3,
    heightCm: 175,
    weightKg: 75,
    position: "ALA",
    ...overrides,
  };
}

function makeSquad(count: number, overrides: (i: number) => Partial<BalancerPlayer> = () => ({})) {
  return Array.from({ length: count }, (_, i) => makePlayer(i, overrides(i)));
}

describe("median", () => {
  it("devolve null para lista vazia", () => {
    expect(median([])).toBeNull();
  });

  it("usa a media dos dois centrais em listas pares", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("nao depende da ordem de entrada", () => {
    expect(median([5, 1, 3])).toBe(3);
  });
});

describe("computeStrength", () => {
  it("cresce com estrelas, altura e peso", () => {
    expect(computeStrength(5, 195, 95)).toBeGreaterThan(computeStrength(1, 160, 55));
  });

  it("da peso dominante as estrelas", () => {
    const baixoAlto = computeStrength(2, 195, 95);
    const altoBaixo = computeStrength(4, 160, 55);
    expect(altoBaixo).toBeGreaterThan(baixoAlto);
  });

  it("satura fora da faixa de altura e peso", () => {
    expect(computeStrength(3, 210, 120)).toBe(computeStrength(3, 195, 95));
    expect(computeStrength(3, 140, 40)).toBe(computeStrength(3, 160, 55));
  });
});

describe("ratePlayers", () => {
  it("substitui estrelas null pela mediana do grupo e marca o jogador", () => {
    const players = [
      makePlayer(0, { stars: 2 }),
      makePlayer(1, { stars: 4 }),
      makePlayer(2, { stars: 5 }),
      makePlayer(3, { stars: null }),
    ];

    const { rated, medianStars } = ratePlayers(players);

    expect(medianStars).toBe(4);
    const semNota = rated.find((p) => p.userId === "u3");
    expect(semNota?.unrated).toBe(true);
    expect(semNota?.starsUsed).toBe(4);
    expect(rated.filter((p) => p.unrated)).toHaveLength(1);
  });

  it("cai na mediana padrao quando ninguem foi avaliado", () => {
    const { rated, medianStars } = ratePlayers(makeSquad(4, () => ({ stars: null })));
    expect(medianStars).toBe(3);
    expect(rated.every((p) => p.starsUsed === 3)).toBe(true);
  });

  it("cobre altura e peso ausentes com a mediana", () => {
    const players = [
      makePlayer(0, { heightCm: 170, weightKg: 70 }),
      makePlayer(1, { heightCm: 180, weightKg: 80 }),
      makePlayer(2, { heightCm: null, weightKg: null }),
    ];
    const { rated } = ratePlayers(players);
    const semDados = rated.find((p) => p.userId === "u2");
    expect(semDados?.strength).toBe(computeStrength(3, 175, 75));
  });
});

describe("balanceTeams", () => {
  it("monta 4 times de 5 com 20 inscritos", () => {
    const squad = makeSquad(20, (i) => ({
      stars: [2, 2.5, 3, 3.5, 4, 4.5, 5][i % 7],
      heightCm: 162 + i,
      weightKg: 60 + i,
    }));

    const result = balanceTeams(squad, { teamSize: 5, seed: 7 });

    expect(result.teams).toHaveLength(4);
    expect(result.teams.map((t) => t.name)).toEqual(["A", "B", "C", "D"]);
    expect(result.teams.every((t) => t.players.length === 5)).toBe(true);
    expect(result.reserves).toHaveLength(0);

    const todos = result.teams.flatMap((t) => t.players.map((p) => p.userId));
    expect(new Set(todos).size).toBe(20);
  });

  it("deixa a diferenca entre o time mais forte e o mais fraco pequena", () => {
    const squad = makeSquad(20, (i) => ({
      stars: [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5][i % 10],
      heightCm: 165 + (i % 12),
      weightKg: 62 + (i % 15),
    }));

    const result = balanceTeams(squad, { teamSize: 5, seed: 3 });
    const medias = result.teams.map((t) => t.averageStrength);

    expect(result.spread).toBeCloseTo(Math.max(...medias) - Math.min(...medias), 1);
    expect(result.spread).toBeLessThan(5);
  });

  it("sorteia mesmo com jogadores sem avaliacao e informa quantos sao", () => {
    const squad = makeSquad(20, (i) => ({
      stars: i < 7 ? null : 3 + (i % 3) * 0.5,
    }));

    const result = balanceTeams(squad, { teamSize: 5, seed: 11 });

    expect(result.unratedCount).toBe(7);
    expect(result.teams).toHaveLength(4);
    const marcados = result.teams.flatMap((t) => t.players).filter((p) => p.unrated);
    expect(marcados).toHaveLength(7);
    expect(marcados.every((p) => p.starsUsed === result.medianStars)).toBe(true);
  });

  it("com 18 inscritos monta 3 times e manda 3 para a reserva", () => {
    const result = balanceTeams(makeSquad(18), { teamSize: 5, seed: 5 });

    expect(result.teams).toHaveLength(3);
    expect(result.teams.every((t) => t.players.length === 5)).toBe(true);
    expect(result.reserves).toHaveLength(3);

    const escalados = new Set(result.teams.flatMap((t) => t.players.map((p) => p.userId)));
    expect(result.reserves.every((p) => !escalados.has(p.userId))).toBe(true);
  });

  it("distribui um goleiro por time quando ha goleiros suficientes", () => {
    const positions: BalancerPosition[] = ["GOALKEEPER", "GOALKEEPER", "GOALKEEPER", "GOALKEEPER"];
    const squad = makeSquad(20, (i) => ({
      position: i < 4 ? positions[i] : "ALA",
      stars: i < 4 ? 3 : 4,
    }));

    const result = balanceTeams(squad, { teamSize: 5, seed: 2 });

    expect(result.teams).toHaveLength(4);
    for (const team of result.teams) {
      expect(team.players.filter((p) => p.isKeeper)).toHaveLength(1);
    }
  });

  it("nao concentra goleiros quando ha menos goleiros que times", () => {
    const squad = makeSquad(20, (i) => ({ position: i < 2 ? "GOALKEEPER" : "PIVO" }));
    const result = balanceTeams(squad, { teamSize: 5, seed: 9 });
    const porTime = result.teams.map((t) => t.players.filter((p) => p.isKeeper).length);
    expect(porTime.filter((n) => n === 1)).toHaveLength(2);
    expect(Math.max(...porTime)).toBe(1);
  });

  it("trata goleiro extra como jogador de linha", () => {
    const squad = makeSquad(20, (i) => ({ position: i < 6 ? "GOALKEEPER" : "FIXO" }));
    const result = balanceTeams(squad, { teamSize: 5, seed: 4 });
    const total = result.teams.flatMap((t) => t.players).filter((p) => p.isKeeper).length;
    expect(total).toBe(6);
    expect(result.teams.every((t) => t.players.filter((p) => p.isKeeper).length >= 1)).toBe(true);
  });

  it("sementes diferentes produzem sorteios diferentes", () => {
    const squad = makeSquad(20, (i) => ({ stars: 1 + (i % 9) * 0.5, heightCm: 165 + i, weightKg: 60 + i }));
    const a = balanceTeams(squad, { teamSize: 5, seed: 1 });
    const b = balanceTeams(squad, { teamSize: 5, seed: 99 });

    const chave = (r: typeof a) => r.teams.map((t) => t.players.map((p) => p.userId).sort().join("-")).join("|");
    expect(chave(a)).not.toBe(chave(b));
  });

  it("a mesma semente produz sempre o mesmo sorteio", () => {
    const squad = makeSquad(20, (i) => ({ stars: 1 + (i % 9) * 0.5 }));
    const a = balanceTeams(squad, { teamSize: 5, seed: 42 });
    const b = balanceTeams(squad, { teamSize: 5, seed: 42 });
    expect(JSON.stringify(a.teams)).toBe(JSON.stringify(b.teams));
  });

  it("limita em 5 times e manda o excedente para a reserva", () => {
    const result = balanceTeams(makeSquad(33), { teamSize: 5, seed: 6 });
    expect(result.teams).toHaveLength(5);
    expect(result.reserves).toHaveLength(8);
  });

  it("recusa sorteio sem gente para dois times", () => {
    expect(() => balanceTeams(makeSquad(9), { teamSize: 5 })).toThrow(BalanceError);
    expect(() => balanceTeams(makeSquad(9), { teamSize: 5 })).toThrow(/10 jogadores/);
  });

  it("recusa tamanho de time invalido", () => {
    expect(() => balanceTeams(makeSquad(20), { teamSize: 0 })).toThrow(BalanceError);
  });

  it("respeita o limite de times pedido", () => {
    const result = balanceTeams(makeSquad(20), { teamSize: 5, maxTeams: 2, seed: 8 });
    expect(result.teams).toHaveLength(2);
    expect(result.reserves).toHaveLength(10);
  });
});
