import { describe, expect, it } from "vitest";
import { planMatchEvents } from "@/lib/match-event";

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
