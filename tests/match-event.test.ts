import { describe, expect, it } from "vitest";
import { pairGoalsWithAssists, planMatchEvents, type PairableEvent } from "@/lib/match-event";

describe("planMatchEvents", () => {
  it("gol sem assistencia (individual) cria so o gol", () => {
    expect(planMatchEvents({ type: "GOAL", userId: "davi" })).toEqual({
      ok: true,
      drafts: [{ type: "GOAL", userId: "davi" }],
    });
    expect(planMatchEvents({ type: "GOAL", userId: "davi", assistUserId: null })).toEqual({
      ok: true,
      drafts: [{ type: "GOAL", userId: "davi" }],
    });
  });

  it("gol com assistencia cria os dois eventos, o gol primeiro", () => {
    expect(planMatchEvents({ type: "GOAL", userId: "davi", assistUserId: "alan" })).toEqual({
      ok: true,
      drafts: [
        { type: "GOAL", userId: "davi" },
        { type: "ASSIST", userId: "alan" },
      ],
    });
  });

  it("recusa que o autor do gol seja o autor da assistencia", () => {
    const plan = planMatchEvents({ type: "GOAL", userId: "davi", assistUserId: "davi" });
    expect(plan.ok).toBe(false);
  });

  it("recusa assistencia pendurada em outra assistencia", () => {
    const plan = planMatchEvents({ type: "ASSIST", userId: "alan", assistUserId: "davi" });
    expect(plan.ok).toBe(false);
  });

  it("assistencia avulsa continua valida", () => {
    expect(planMatchEvents({ type: "ASSIST", userId: "alan" })).toEqual({
      ok: true,
      drafts: [{ type: "ASSIST", userId: "alan" }],
    });
  });
});

function ev(id: string, type: "GOAL" | "ASSIST", teamId: string, elapsedMs: number, createdAt: string): PairableEvent {
  return { id, type, teamId, elapsedMs, createdAt };
}

describe("pairGoalsWithAssists", () => {
  it("sem lances, sem gols", () => {
    expect(pairGoalsWithAssists([])).toEqual([]);
  });

  it("gol individual fica sem assistencia", () => {
    const goal = ev("g1", "GOAL", "A", 30_000, "2026-01-01T10:00:30.000Z");
    expect(pairGoalsWithAssists([goal])).toEqual([{ goal, assist: null }]);
  });

  it("liga a assistencia ao gol do mesmo time e minuto", () => {
    const goal = ev("g1", "GOAL", "A", 90_000, "2026-01-01T10:01:30.000Z");
    const assist = ev("a1", "ASSIST", "A", 90_000, "2026-01-01T10:01:30.000Z");
    expect(pairGoalsWithAssists([goal, assist])).toEqual([{ goal, assist }]);
  });

  it("aceita a ordem do banco (mais recente primeiro) e devolve do primeiro gol ao ultimo", () => {
    const g1 = ev("g1", "GOAL", "A", 60_000, "2026-01-01T10:01:00.000Z");
    const a1 = ev("a1", "ASSIST", "A", 60_000, "2026-01-01T10:01:00.000Z");
    const g2 = ev("g2", "GOAL", "B", 200_000, "2026-01-01T10:03:20.000Z");
    const pairs = pairGoalsWithAssists([g2, a1, g1]);
    expect(pairs).toEqual([
      { goal: g1, assist: a1 },
      { goal: g2, assist: null },
    ]);
  });

  it("assistencia de outro time ou de outro minuto nao se liga ao gol", () => {
    const goal = ev("g1", "GOAL", "A", 60_000, "2026-01-01T10:01:00.000Z");
    const otherTeam = ev("a1", "ASSIST", "B", 60_000, "2026-01-01T10:01:00.000Z");
    const otherMinute = ev("a2", "ASSIST", "A", 120_000, "2026-01-01T10:02:00.000Z");
    expect(pairGoalsWithAssists([goal, otherTeam, otherMinute])).toEqual([{ goal, assist: null }]);
  });

  it("dois gols no mesmo instante e time (relogio parado) levam cada um a sua assistencia, na ordem", () => {
    const g1 = ev("g1", "GOAL", "A", 60_000, "2026-01-01T10:01:00.100Z");
    const a1 = ev("a1", "ASSIST", "A", 60_000, "2026-01-01T10:01:00.100Z");
    const g2 = ev("g2", "GOAL", "A", 60_000, "2026-01-01T10:01:05.000Z");
    const a2 = ev("a2", "ASSIST", "A", 60_000, "2026-01-01T10:01:05.000Z");
    expect(pairGoalsWithAssists([a2, g2, a1, g1])).toEqual([
      { goal: g1, assist: a1 },
      { goal: g2, assist: a2 },
    ]);
  });

  it("gol e assistencia com o mesmo createdAt: o gol vem primeiro", () => {
    const goal = ev("z-goal", "GOAL", "A", 10_000, "2026-01-01T10:00:10.000Z");
    const assist = ev("a-assist", "ASSIST", "A", 10_000, "2026-01-01T10:00:10.000Z");
    expect(pairGoalsWithAssists([assist, goal])).toEqual([{ goal, assist }]);
  });
});
