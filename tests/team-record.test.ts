import { describe, expect, it } from "vitest";
import { summarizeTeam, type FinishedMatchRow } from "../src/lib/team-record";

function match(overrides: Partial<FinishedMatchRow> & Pick<FinishedMatchRow, "id" | "homeTeamId" | "awayTeamId">): FinishedMatchRow {
  return { orderIndex: 1, homeScore: 0, awayScore: 0, result: "DRAW", ...overrides };
}

describe("summarizeTeam", () => {
  it("time sem jogos tem tudo zerado e historico vazio", () => {
    const { record, history } = summarizeTeam("E", [match({ id: "m1", homeTeamId: "A", awayTeamId: "B" })]);
    expect(record).toEqual({ played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 });
    expect(history).toEqual([]);
    expect(summarizeTeam("A", []).record.played).toBe(0);
  });

  it("vitoria como mandante", () => {
    const { record, history } = summarizeTeam("A", [
      match({ id: "m1", homeTeamId: "A", awayTeamId: "B", homeScore: 2, awayScore: 1, result: "HOME" }),
    ]);
    expect(record).toEqual({ played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 1 });
    expect(history).toEqual([
      { matchId: "m1", orderIndex: 1, opponentTeamId: "B", goalsFor: 2, goalsAgainst: 1, outcome: "WIN" },
    ]);
  });

  it("derrota como visitante, com o placar do ponto de vista do time", () => {
    const { record, history } = summarizeTeam("B", [
      match({ id: "m1", homeTeamId: "A", awayTeamId: "B", homeScore: 3, awayScore: 0, result: "HOME" }),
    ]);
    expect(record).toEqual({ played: 1, won: 0, drawn: 0, lost: 1, goalsFor: 0, goalsAgainst: 3 });
    expect(history[0]).toMatchObject({ opponentTeamId: "A", goalsFor: 0, goalsAgainst: 3, outcome: "LOSS" });
  });

  it("vitoria como visitante", () => {
    const { record, history } = summarizeTeam("B", [
      match({ id: "m1", homeTeamId: "A", awayTeamId: "B", homeScore: 0, awayScore: 2, result: "AWAY" }),
    ]);
    expect(record).toMatchObject({ won: 1, lost: 0, goalsFor: 2, goalsAgainst: 0 });
    expect(history[0].outcome).toBe("WIN");
  });

  it("empate, e result nulo tambem conta como empate", () => {
    const rows = [
      match({ id: "m1", orderIndex: 1, homeTeamId: "A", awayTeamId: "B", homeScore: 1, awayScore: 1, result: "DRAW" }),
      match({ id: "m2", orderIndex: 2, homeTeamId: "C", awayTeamId: "A", homeScore: 0, awayScore: 0, result: null }),
    ];
    const { record, history } = summarizeTeam("A", rows);
    expect(record).toEqual({ played: 2, won: 0, drawn: 2, lost: 0, goalsFor: 1, goalsAgainst: 1 });
    expect(history.map((entry) => entry.outcome)).toEqual(["DRAW", "DRAW"]);
  });

  it("tres partidas misturadas com outros times, na ordem das partidas", () => {
    // Fora de ordem de proposito: o historico segue o orderIndex.
    const rows = [
      match({ id: "m3", orderIndex: 3, homeTeamId: "C", awayTeamId: "D", homeScore: 1, awayScore: 1, result: "DRAW" }),
      match({ id: "m1", orderIndex: 1, homeTeamId: "A", awayTeamId: "B", homeScore: 2, awayScore: 1, result: "HOME" }),
      match({ id: "m2", orderIndex: 2, homeTeamId: "A", awayTeamId: "C", homeScore: 0, awayScore: 2, result: "AWAY" }),
    ];

    const a = summarizeTeam("A", rows);
    expect(a.record).toEqual({ played: 2, won: 1, drawn: 0, lost: 1, goalsFor: 2, goalsAgainst: 3 });
    expect(a.history.map((entry) => [entry.matchId, entry.opponentTeamId, entry.outcome])).toEqual([
      ["m1", "B", "WIN"],
      ["m2", "C", "LOSS"],
    ]);

    const c = summarizeTeam("C", rows);
    expect(c.record).toEqual({ played: 2, won: 1, drawn: 1, lost: 0, goalsFor: 3, goalsAgainst: 1 });
    expect(c.history.map((entry) => [entry.matchId, entry.opponentTeamId, entry.outcome])).toEqual([
      ["m2", "A", "WIN"],
      ["m3", "D", "DRAW"],
    ]);

    expect(summarizeTeam("E", rows).record.played).toBe(0);
  });
});
