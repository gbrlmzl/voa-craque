import {
  MINUTE_STEPS,
  addDays,
  addMonths,
  compareDay,
  formatLocalInput,
  formatLongDay,
  formatMonthTitle,
  formatPickerLabel,
  localDayOf,
  monthGrid,
  parseLocalInput,
} from "../../src/lib/calendar";

describe("parseLocalInput", () => {
  it("le o texto do datetime-local em partes", () => {
    expect(parseLocalInput("2026-10-22T19:30")).toEqual({
      year: 2026,
      month: 10,
      day: 22,
      hour: 19,
      minute: 30,
    });
  });

  it("devolve null para texto vazio, lixo e data inexistente", () => {
    expect(parseLocalInput("")).toBeNull();
    expect(parseLocalInput("abc")).toBeNull();
    expect(parseLocalInput("2026-02-30T10:00")).toBeNull();
    expect(parseLocalInput("2026-13-01T10:00")).toBeNull();
    expect(parseLocalInput("2026-10-22T24:00")).toBeNull();
    expect(parseLocalInput("2026-10-22T10:60")).toBeNull();
    expect(parseLocalInput("2026-10-22 19:30")).toBeNull();
  });

  it("aceita 29 de fevereiro so em ano bissexto", () => {
    expect(parseLocalInput("2028-02-29T10:00")).not.toBeNull();
    expect(parseLocalInput("2027-02-29T10:00")).toBeNull();
  });

  it("ida e volta com formatLocalInput nao muda o texto", () => {
    for (const text of ["2026-10-22T19:30", "2026-01-01T00:00", "2028-02-29T23:55", "2026-09-23T16:07"]) {
      expect(formatLocalInput(parseLocalInput(text)!)).toBe(text);
    }
  });
});

describe("monthGrid", () => {
  it("outubro de 2026 comeca numa quinta, com 4 dias de setembro na primeira semana", () => {
    const grid = monthGrid(2026, 10);
    expect(grid).toHaveLength(6);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid[0].map((cell) => [cell.month, cell.day, cell.inMonth])).toEqual([
      [9, 27, false],
      [9, 28, false],
      [9, 29, false],
      [9, 30, false],
      [10, 1, true],
      [10, 2, true],
      [10, 3, true],
    ]);
  });

  it("completa as 6 semanas com dias do mes seguinte", () => {
    const last = monthGrid(2026, 10)[5];
    // 31/10/2026 e sabado: a quinta semana fecha o mes, entao a sexta linha vem toda de novembro.
    expect(last.every((cell) => cell.month === 11 && !cell.inMonth)).toBe(true);
    expect(last[0]).toMatchObject({ year: 2026, month: 11, day: 1 });
  });

  it("fevereiro de 2027 tem 28 dias e o de 2028 tem 29", () => {
    const inMonthDays = (year: number) =>
      monthGrid(year, 2)
        .flat()
        .filter((cell) => cell.inMonth).length;
    expect(inMonthDays(2027)).toBe(28);
    expect(inMonthDays(2028)).toBe(29);
  });

  it("novembro de 2026 comeca num domingo", () => {
    expect(monthGrid(2026, 11)[0][0]).toMatchObject({ month: 11, day: 1, inMonth: true });
  });

  it("janeiro completa a primeira semana com dias de dezembro do ano anterior", () => {
    const first = monthGrid(2027, 1)[0][0];
    expect(first).toMatchObject({ year: 2026, month: 12, inMonth: false });
  });
});

describe("addMonths", () => {
  it("vira o ano nos dois sentidos", () => {
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("anda varios meses", () => {
    expect(addMonths(2026, 10, 3)).toEqual({ year: 2027, month: 1 });
    expect(addMonths(2026, 10, -10)).toEqual({ year: 2025, month: 12 });
    expect(addMonths(2026, 10, 0)).toEqual({ year: 2026, month: 10 });
  });
});

describe("addDays e compareDay", () => {
  it("addDays passa para o mes e o ano seguintes", () => {
    expect(addDays({ year: 2026, month: 10, day: 31 }, 1)).toEqual({ year: 2026, month: 11, day: 1 });
    expect(addDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(addDays({ year: 2026, month: 3, day: 1 }, -1)).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it("compareDay compara so pelo dia", () => {
    const a = { year: 2026, month: 10, day: 20 };
    expect(compareDay(a, { year: 2026, month: 10, day: 20 })).toBe(0);
    expect(compareDay(a, { year: 2026, month: 10, day: 22 })).toBeLessThan(0);
    expect(compareDay(a, { year: 2026, month: 9, day: 30 })).toBeGreaterThan(0);
    expect(compareDay(a, { year: 2025, month: 12, day: 31 })).toBeGreaterThan(0);
  });

  it("localDayOf usa o dia do relogio do aparelho", () => {
    expect(localDayOf(new Date(2026, 9, 20, 23, 59))).toEqual({ year: 2026, month: 10, day: 20 });
  });
});

describe("rotulos", () => {
  it("rotulo do campo", () => {
    // 22/10/2026 e quinta-feira.
    expect(formatPickerLabel({ year: 2026, month: 10, day: 22, hour: 19, minute: 0 })).toBe(
      "Qui, 22 de out. · 19:00",
    );
    expect(formatPickerLabel({ year: 2026, month: 9, day: 23, hour: 9, minute: 5 })).toBe(
      "Qua, 23 de set. · 09:05",
    );
  });

  it("dia por extenso", () => {
    expect(formatLongDay({ year: 2026, month: 10, day: 22 })).toBe("Quinta-feira, 22 de outubro de 2026");
    expect(formatLongDay({ year: 2026, month: 10, day: 20 })).toBe("Terça-feira, 20 de outubro de 2026");
    expect(formatLongDay({ year: 2028, month: 2, day: 29 })).toBe("Terça-feira, 29 de fevereiro de 2028");
  });

  it("titulo do mes", () => {
    expect(formatMonthTitle(2026, 10)).toBe("Outubro de 2026");
    expect(formatMonthTitle(2027, 3)).toBe("Março de 2027");
  });
});

describe("MINUTE_STEPS", () => {
  it("vai de 0 a 55 de cinco em cinco", () => {
    expect(MINUTE_STEPS).toHaveLength(12);
    expect(MINUTE_STEPS[0]).toBe(0);
    expect(MINUTE_STEPS[11]).toBe(55);
    expect(MINUTE_STEPS.every((minute, index) => minute === index * 5)).toBe(true);
  });
});
