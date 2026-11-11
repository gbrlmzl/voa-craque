import { prisma } from "@/lib/prisma";
import { buildRanking, mmrRankOf, mmrRanks } from "@/services/ranking";
import { createPlayer, createUser, finishGameDay } from "../../helpers/factories";

describe("buildRanking", () => {
  it("sem peladas: so quem tem perfil completo e ativo, ordenado pelo nome, sem MMR", async () => {
    await createPlayer({ profile: { name: "Bruno" } });
    await createPlayer({ profile: { name: "Ana" } });
    await createPlayer({ active: false, profile: { name: "Inativo" } });
    await createUser({ profile: { completed: false, name: "Incompleto" } });
    await createUser({ profile: false });

    const rows = await buildRanking({ showMmrDelta: false });
    expect(rows.map((r) => r.name)).toEqual(["Ana", "Bruno"]);
    expect(rows.every((r) => r.mmr === null && r.mmrRank === null && r.mmrTrend === null)).toBe(true);
  });

  it("depois de uma pelada: gols, assistencias, partidas e posicao pelo MMR", async () => {
    await finishGameDay();
    const rows = await buildRanking({ showMmrDelta: false });

    expect(rows).toHaveLength(13); // os 12 jogadores e o organizador (tem perfil completo, nao jogou)
    expect(rows.filter((r) => r.played > 0)).toHaveLength(12);
    const goals = rows.reduce((sum, r) => sum + r.goals, 0);
    expect(goals).toBe(await prisma.matchEvent.count({ where: { type: "GOAL" } }));
    // ordenado por gols (desc), depois assistencias, depois nome
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].goals).toBeGreaterThanOrEqual(rows[i].goals);
    }
    const ranked = rows.filter((r) => r.mmrRank !== null).sort((a, b) => a.mmrRank! - b.mmrRank!);
    expect(ranked.map((r) => r.mmrRank)).toEqual(Array.from({ length: ranked.length }, (_, i) => i + 1));
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].mmr!).toBeGreaterThanOrEqual(ranked[i].mmr!);
    expect(rows.every((r) => r.gameDays === (r.played > 0 ? 1 : 0))).toBe(true);
    expect(rows.filter((r) => r.mmr === null)).toHaveLength(1);
    expect(rows.every((r) => r.winRate === (r.played ? r.won / r.played : 0))).toBe(true);
    expect(rows.filter((r) => r.mmr !== null).every((r) => r.mmrTrend !== null)).toBe(true);
  });

  it("o delta do MMR so aparece quando pedido (organizador)", async () => {
    await finishGameDay();
    const hidden = await buildRanking({ showMmrDelta: false });
    const shown = await buildRanking({ showMmrDelta: true });
    expect(hidden.every((r) => r.mmrDelta === null)).toBe(true);
    expect(shown.some((r) => r.mmrDelta !== null)).toBe(true);
  });

  it("empate no MMR desempata pelo nome", async () => {
    const [b, a] = [await createPlayer({ profile: { name: "Bruno" } }), await createPlayer({ profile: { name: "Ana" } })];
    await prisma.playerRating.createMany({ data: [{ userId: b.id, mmr: 1000 }, { userId: a.id, mmr: 1000 }] });
    const ranks = await mmrRanks();
    expect(ranks.get(a.id)).toBe(1);
    expect(ranks.get(b.id)).toBe(2);
  });
});

describe("mmrRanks / mmrRankOf", () => {
  it("fora do ranking: inativo, sem perfil completo ou sem MMR", async () => {
    const active = await createPlayer();
    const inactive = await createPlayer({ active: false });
    const incomplete = await createUser({ profile: { completed: false } });
    const noMmr = await createPlayer();
    await prisma.playerRating.createMany({
      data: [active, inactive, incomplete].map((u, i) => ({ userId: u.id, mmr: 1000 + i })),
    });

    expect(await mmrRankOf(active.id)).toBe(1);
    expect(await mmrRankOf(inactive.id)).toBeNull();
    expect(await mmrRankOf(incomplete.id)).toBeNull();
    expect(await mmrRankOf(noMmr.id)).toBeNull();
  });
});
