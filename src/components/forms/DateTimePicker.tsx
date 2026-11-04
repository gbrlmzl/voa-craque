"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Modal, cn } from "@/components/ui";
import { CONTROL } from "@/components/ui/controlStyles";
import { useDateTimePicker } from "@/hooks/useDateTimePicker";
import {
  MINUTE_STEPS,
  compareDay,
  formatLongDay,
  formatMonthTitle,
  formatPickerLabel,
  monthGrid,
  parseLocalInput,
} from "@/lib/calendar";

const WEEKDAY_INITIALS = ["D", "S", "T", "Q", "Q", "S", "S"];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const DEFAULT_HOUR = 19;

const PICK_BASE = "grid h-11 place-items-center rounded-xl text-sm tabular-nums transition-colors";
const PICK_IDLE = "bg-night-800 text-slate-200 hover:bg-night-700";
const PICK_SELECTED = "bg-pitch-500 font-semibold text-night-950";

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Campo de data e hora da pelada. O valor continua sendo o texto
 * "YYYY-MM-DDTHH:mm" sem fuso do <input type="datetime-local">; a escolha
 * acontece numa folha (Modal) e so vira valor no "Confirmar".
 */
export function DateTimePicker({
  value,
  onChange,
  error,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  id?: string;
}) {
  const picker = useDateTimePicker(value, onChange);
  const current = parseLocalInput(value);
  const hoursRef = useRef<HTMLDivElement>(null);
  const hourToShow = picker.draft.hour ?? DEFAULT_HOUR;

  // Ao abrir, a grade de horas rola ate a hora escolhida (ou 19h, se ainda nao ha escolha).
  useEffect(() => {
    if (!picker.open) return;
    const grid = hoursRef.current;
    const target = grid?.querySelector<HTMLElement>(`[data-hour="${hourToShow}"]`);
    if (grid && target) grid.scrollTop = target.offsetTop - (grid.clientHeight - target.offsetHeight) / 2;
    // So na abertura: escolher outra hora nao precisa rolar a grade.
  }, [picker.open]);

  const { draft, today } = picker;
  const summary =
    draft.day && draft.hour !== null
      ? `${formatLongDay(draft.day)} · ${pad(draft.hour)}:${pad(draft.minute ?? 0)}`
      : "Escolha o dia e a hora";

  const sheet = (
    <Modal title="Data e hora" onClose={picker.cancel}>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" size="sm" className="touch-target" onClick={picker.pickToday}>
          Hoje
        </Button>
        <Button type="button" variant="secondary" size="sm" className="touch-target" onClick={picker.pickTomorrow}>
          Amanhã
        </Button>
      </div>

      <section aria-label="Calendário">
        <div className="mb-1 flex items-center justify-between">
          <button
            type="button"
            onClick={() => picker.changeMonth(-1)}
            aria-label="Mês anterior"
            className="grid h-11 w-11 place-items-center rounded-xl text-slate-300 hover:bg-white/5"
          >
            <ChevronLeft size={20} aria-hidden />
          </button>
          <p aria-live="polite" className="text-base font-semibold text-slate-100">
            {formatMonthTitle(picker.view.year, picker.view.month)}
          </p>
          <button
            type="button"
            onClick={() => picker.changeMonth(1)}
            aria-label="Próximo mês"
            className="grid h-11 w-11 place-items-center rounded-xl text-slate-300 hover:bg-white/5"
          >
            <ChevronRight size={20} aria-hidden />
          </button>
        </div>

        <div aria-hidden className="grid grid-cols-7 pb-1 text-center text-xs font-medium text-slate-500">
          {WEEKDAY_INITIALS.map((initial, index) => (
            <span key={index}>{initial}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {monthGrid(picker.view.year, picker.view.month)
            .flat()
            .map((cell) => {
              const selected = draft.day !== null && compareDay(cell, draft.day) === 0;
              const isToday = today !== null && compareDay(cell, today) === 0;
              const disabled = picker.isDayDisabled(cell);
              return (
                <button
                  key={`${cell.year}-${cell.month}-${cell.day}`}
                  type="button"
                  disabled={disabled}
                  aria-label={formatLongDay(cell)}
                  aria-pressed={selected}
                  onClick={() => picker.pickDay(cell)}
                  className={cn(
                    "grid h-11 place-items-center rounded-xl text-sm tabular-nums transition-colors disabled:cursor-not-allowed",
                    selected
                      ? PICK_SELECTED
                      : cell.inMonth
                        ? "text-slate-100 hover:bg-white/5"
                        : "text-slate-600 hover:bg-white/5",
                    isToday && !selected && "ring-1 ring-pitch-400/60",
                    disabled && "opacity-30",
                  )}
                >
                  {cell.day}
                </button>
              );
            })}
        </div>
      </section>

      <section>
        <p className="mb-1.5 text-sm font-medium text-slate-300">Hora</p>
        <div ref={hoursRef} className="relative grid max-h-[9.5rem] grid-cols-6 gap-1.5 overflow-y-auto">
          {HOURS.map((hour) => (
            <button
              key={hour}
              type="button"
              data-hour={hour}
              aria-pressed={draft.hour === hour}
              aria-label={`${pad(hour)} horas`}
              onClick={() => picker.pickHour(hour)}
              className={cn(PICK_BASE, draft.hour === hour ? PICK_SELECTED : PICK_IDLE)}
            >
              {pad(hour)}
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-1.5 text-sm font-medium text-slate-300">Minutos</p>
        <div className="grid grid-cols-6 gap-1.5">
          {[...MINUTE_STEPS, ...(picker.extraMinute === null ? [] : [picker.extraMinute])].map((minute) => (
            <button
              key={minute}
              type="button"
              aria-pressed={(draft.minute ?? 0) === minute}
              aria-label={`${pad(minute)} minutos`}
              onClick={() => picker.pickMinute(minute)}
              className={cn(PICK_BASE, (draft.minute ?? 0) === minute ? PICK_SELECTED : PICK_IDLE)}
            >
              {pad(minute)}
            </button>
          ))}
        </div>
      </section>

      {/* Rodape preso na base (-bottom-4 desconta o p-4 do fundo do Modal): a folha passa da altura do celular. */}
      <div className="sticky -bottom-4 -mx-4 -mb-4 grid gap-2 border-t border-white/10 bg-night-900 px-4 pt-3 pb-4">
        <p className="text-center text-sm text-slate-300">{summary}</p>
        <Button type="button" size="lg" className="w-full" disabled={!picker.canConfirm} onClick={picker.confirm}>
          Confirmar
        </Button>
      </div>
    </Modal>
  );

  return (
    <>
      <button
        type="button"
        id={id}
        onClick={picker.openSheet}
        aria-haspopup="dialog"
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, "flex h-12 items-center gap-2 text-left")}
      >
        <CalendarDays size={18} className="shrink-0 text-slate-400" aria-hidden />
        <span className={cn("min-w-0 flex-1 truncate", !current && "text-slate-500")}>
          {current ? formatPickerLabel(current) : "Escolha o dia e a hora"}
        </span>
      </button>
      {/* Fora do <label> do Field: um clique no fundo do modal reativaria o botao do campo. */}
      {picker.open ? createPortal(sheet, document.body) : null}
    </>
  );
}
