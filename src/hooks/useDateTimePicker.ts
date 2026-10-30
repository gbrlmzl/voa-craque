"use client";

import { useState } from "react";
import {
  type DayParts,
  MINUTE_STEPS,
  addDays,
  addMonths,
  compareDay,
  formatLocalInput,
  localDayOf,
  parseLocalInput,
} from "@/lib/calendar";

type Draft = { day: DayParts | null; hour: number | null; minute: number | null };

const EMPTY_DRAFT: Draft = { day: null, hour: null, minute: null };

/** Estado da folha de data e hora. O rascunho nasce do valor a cada abertura e so vira valor no "Confirmar". */
export function useDateTimePicker(value: string, onChange: (value: string) => void) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ year: 2026, month: 1 });
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  // "Hoje" e lido so quando a folha abre (ela so existe no navegador): sem diferenca de hidratacao.
  const [today, setToday] = useState<DayParts | null>(null);
  // Dia e minuto gravados na pelada: nao se perdem ao editar mesmo fora das regras (dia passado, 16:07).
  const [saved, setSaved] = useState<{ day: DayParts; minute: number } | null>(null);

  function openSheet() {
    const now = localDayOf(new Date());
    const parsed = parseLocalInput(value);
    const day = parsed ? { year: parsed.year, month: parsed.month, day: parsed.day } : null;
    setToday(now);
    setSaved(parsed && day ? { day, minute: parsed.minute } : null);
    setDraft(parsed && day ? { day, hour: parsed.hour, minute: parsed.minute } : EMPTY_DRAFT);
    const anchor = day ?? now;
    setView({ year: anchor.year, month: anchor.month });
    setOpen(true);
  }

  function cancel() {
    setOpen(false);
  }

  function confirm() {
    if (!draft.day || draft.hour === null) return;
    onChange(formatLocalInput({ ...draft.day, hour: draft.hour, minute: draft.minute ?? 0 }));
    setOpen(false);
  }

  function pickDay(day: DayParts) {
    setDraft((current) => ({ ...current, day }));
    // Tocar num dia de outro mes leva o calendario para ele.
    setView({ year: day.year, month: day.month });
  }

  function pickToday() {
    if (today) pickDay(today);
  }

  function pickTomorrow() {
    if (today) pickDay(addDays(today, 1));
  }

  function pickHour(hour: number) {
    setDraft((current) => ({ ...current, hour }));
  }

  function pickMinute(minute: number) {
    setDraft((current) => ({ ...current, minute }));
  }

  function changeMonth(delta: number) {
    setView((current) => addMonths(current.year, current.month, delta));
  }

  /** Dia anterior a hoje fica bloqueado, menos o que ja estava gravado (D6). */
  function isDayDisabled(day: DayParts): boolean {
    if (!today || compareDay(day, today) >= 0) return false;
    return !(saved && compareDay(day, saved.day) === 0);
  }

  // Minuto gravado fora dos passos de 5 ganha um botao a mais, para nao se perder ao editar.
  const extraMinute = saved && !MINUTE_STEPS.includes(saved.minute) ? saved.minute : null;

  return {
    open,
    openSheet,
    cancel,
    confirm,
    view,
    changeMonth,
    draft,
    today,
    pickDay,
    pickToday,
    pickTomorrow,
    pickHour,
    pickMinute,
    isDayDisabled,
    extraMinute,
    canConfirm: draft.day !== null && draft.hour !== null,
  };
}
