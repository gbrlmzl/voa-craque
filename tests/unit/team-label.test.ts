import { describe, expect, it } from "vitest";
import { TEAM_NAMES } from "../src/lib/team-balancer";
import {
  DEFAULT_TEAM_LABEL_MODE,
  formatTeamName,
  formatTeamTag,
  parseTeamLabelMode,
} from "../src/lib/team-label";

describe("formatTeamName", () => {
  it("modo letras mantem a letra gravada", () => {
    expect(formatTeamName("A", "letters")).toBe("Time A");
    expect(formatTeamName("E", "letters")).toBe("Time E");
  });

  it("modo numeros converte pela posicao no alfabeto", () => {
    expect(formatTeamName("A", "numbers")).toBe("Time 1");
    expect(formatTeamName("B", "numbers")).toBe("Time 2");
    expect(formatTeamName("E", "numbers")).toBe("Time 5");
  });

  it("cobre todos os nomes que o sorteio grava", () => {
    expect(TEAM_NAMES.map((name) => formatTeamName(name, "numbers"))).toEqual([
      "Time 1",
      "Time 2",
      "Time 3",
      "Time 4",
      "Time 5",
    ]);
  });

  it("nome fora de A-Z volta como esta, nos dois modos", () => {
    for (const mode of ["letters", "numbers"] as const) {
      expect(formatTeamName("?", mode)).toBe("Time ?");
      expect(formatTeamName("", mode)).toBe("Time ");
      expect(formatTeamName("a", mode)).toBe("Time a");
      expect(formatTeamName("AB", mode)).toBe("Time AB");
      expect(formatTeamName("1", mode)).toBe("Time 1");
    }
  });
});

describe("formatTeamTag", () => {
  it("devolve so a letra ou o numero, sem o prefixo", () => {
    expect(formatTeamTag("C", "letters")).toBe("C");
    expect(formatTeamTag("C", "numbers")).toBe("3");
    expect(formatTeamTag("?", "numbers")).toBe("?");
  });
});

describe("parseTeamLabelMode", () => {
  it("aceita os dois valores validos", () => {
    expect(parseTeamLabelMode("letters")).toBe("letters");
    expect(parseTeamLabelMode("numbers")).toBe("numbers");
  });

  it("valor invalido, vazio ou ausente cai em letras", () => {
    expect(DEFAULT_TEAM_LABEL_MODE).toBe("letters");
    for (const value of ["", "NUMBERS", "numeros", "1", undefined, null]) {
      expect(parseTeamLabelMode(value)).toBe("letters");
    }
  });
});
