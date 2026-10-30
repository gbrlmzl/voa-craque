/**
 * Contas de calendario do seletor de data e hora. Tudo e feito com numeros e
 * Date.UTC (nunca com o fuso do aparelho), para o resultado ser o mesmo em
 * qualquer celular e no servidor. O valor trafega como "YYYY-MM-DDTHH:mm" sem
 * fuso, o mesmo texto do <input type="datetime-local">.
 */

export type DayParts = { year: number; month: number; day: number }; // month 1-12
export type LocalDateTime = DayParts & { hour: number; minute: number };
export type DayCell = DayParts & { inMonth: boolean };

const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEKDAYS_LONG = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
const MONTHS_SHORT = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
const MONTHS_LONG = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** Minutos oferecidos no seletor: 0, 5, 10, ..., 55. */
export const MINUTE_STEPS: number[] = Array.from({ length: 12 }, (_, index) => index * 5);

const INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const pad = (value: number) => String(value).padStart(2, "0");

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "2026-10-23T19:00" -> partes; texto invalido ou data inexistente (30/02) -> null. */
export function parseLocalInput(value: string): LocalDateTime | null {
  const match = INPUT_PATTERN.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  // Ano de 4 digitos com zeros a esquerda cairia em 19xx no Date.UTC.
  if (year < 1000) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59) return null;
  return { year, month, day, hour, minute };
}

/** Partes -> "2026-10-23T19:00". */
export function formatLocalInput(value: LocalDateTime): string {
  return `${value.year}-${pad(value.month)}-${pad(value.day)}T${pad(value.hour)}:${pad(value.minute)}`;
}

/** 6 semanas de 7 dias, domingo primeiro, completando com dias dos meses vizinhos. */
export function monthGrid(year: number, month: number): DayCell[][] {
  const firstWeekday = utc(year, month, 1).getUTCDay();
  const weeks: DayCell[][] = [];
  for (let week = 0; week < 6; week++) {
    const row: DayCell[] = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      const date = utc(year, month, 1 - firstWeekday + week * 7 + weekday);
      const cell = {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
      };
      row.push({ ...cell, inMonth: cell.year === year && cell.month === month });
    }
    weeks.push(row);
  }
  return weeks;
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function addDays(day: DayParts, delta: number): DayParts {
  const date = utc(day.year, day.month, day.day + delta);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** Negativo, zero ou positivo, so pelo dia. */
export function compareDay(a: DayParts, b: DayParts): number {
  return utc(a.year, a.month, a.day).getTime() - utc(b.year, b.month, b.day).getTime();
}

/** O dia do relogio do aparelho (o "hoje" de quem esta com a folha aberta). */
export function localDayOf(date: Date): DayParts {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

/** "Outubro de 2026" (titulo do calendario). */
export function formatMonthTitle(year: number, month: number): string {
  const name = MONTHS_LONG[month - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${year}`;
}

/** "Qui, 23 de out. · 19:00" */
export function formatPickerLabel(value: LocalDateTime): string {
  const weekday = WEEKDAYS_SHORT[utc(value.year, value.month, value.day).getUTCDay()];
  return `${weekday}, ${value.day} de ${MONTHS_SHORT[value.month - 1]} · ${pad(value.hour)}:${pad(value.minute)}`;
}

/** "Quinta-feira, 23 de outubro de 2026" (aria-label do dia e resumo da folha). */
export function formatLongDay(value: DayParts): string {
  const weekday = WEEKDAYS_LONG[utc(value.year, value.month, value.day).getUTCDay()];
  return `${weekday}, ${value.day} de ${MONTHS_LONG[value.month - 1]} de ${value.year}`;
}
