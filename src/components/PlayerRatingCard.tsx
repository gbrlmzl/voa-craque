"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/components/ui";
import { formatDate, formatMmr, formatMmrDelta, formatMmrPoints, formatStakeFactor, formatStars } from "@/lib/labels";
import type { PlayerRatingDetail, RatingHistoryEntry } from "@/hooks/usePlayerModalProvider";
import { usePlayerRatingCard } from "@/hooks/usePlayerRatingCard";

function deltaColor(delta: number): string {
  if (Math.round(delta) > 0) return "text-pitch-400";
  if (Math.round(delta) < 0) return "text-rose-400";
  return "text-slate-400";
}

/** Uma pelada do extrato: o movimento e, ao tocar, de onde ele veio. */
function HistoryRow({ entry, open, onToggle }: { entry: RatingHistoryEntry; open: boolean; onToggle: () => void }) {
  const base = entry.resultDelta + entry.attackDelta + entry.defenseDelta + entry.normalizeDelta;
  return (
    <li className="rounded-xl bg-night-900/60">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="touch-target flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-slate-200">{entry.gameDayTitle}</span>
          <span className="block text-xs text-slate-500">
            {formatDate(entry.date)} · {entry.goals}G {entry.assists}A · {entry.matches}{" "}
            {entry.matches === 1 ? "jogo" : "jogos"}
          </span>
        </span>
        <span className={cn("shrink-0 text-sm font-semibold tabular-nums", deltaColor(entry.delta))}>
          {formatMmrDelta(entry.delta)}
        </span>
        <ChevronDown size={16} className={cn("shrink-0 text-slate-500 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <dl className="grid gap-1 border-t border-white/5 px-3 py-2 text-xs text-slate-400">
          <Line label="Resultado das partidas" value={formatMmrPoints(entry.resultDelta)} />
          <Line label="Ataque (gols e assistências)" value={formatMmrPoints(entry.attackDelta)} />
          <Line label="Defesa (gols sofridos)" value={formatMmrPoints(entry.defenseDelta)} />
          <Line label="Ajuste da pelada" value={formatMmrPoints(entry.normalizeDelta)} />
          <Line
            label={`Soma × fator de aposta ${formatStakeFactor(entry.stakeFactor)} ${
              entry.starsUsed === null ? "(sem estrela)" : `(${formatStars(entry.starsUsed)}★)`
            }`}
            value={formatMmrPoints(base * entry.stakeFactor)}
          />
          {entry.capped ? <p className="text-amber-400">Limitado pelo teto de uma pelada.</p> : null}
        </dl>
      ) : null}
    </li>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="font-medium tabular-nums text-slate-200">{value}</dd>
    </div>
  );
}

/**
 * Ranking geral na ficha. O jogador ve a posicao; o numero do MMR, o pico e a
 * decomposicao de cada pelada so aparecem para o organizador. A estrela do
 * jogador ja esta na ficha: o MMR nao gera estrela nenhuma.
 */
export function PlayerRatingCard({ rating }: { rating: PlayerRatingDetail }) {
  const { openGameDayId, toggle } = usePlayerRatingCard();
  const pelada = rating.gameDays === 1 ? "pelada" : "peladas";

  if (rating.mmr === null) {
    return (
      <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-night-800 p-3">
        <div>
          <p className="text-xs text-slate-500">Ranking geral</p>
          <p className="text-lg font-semibold text-slate-100">{rating.rank}º</p>
        </div>
        <p className="text-right text-xs text-slate-500">
          {rating.gameDays} {pelada}
        </p>
      </div>
    );
  }

  const last = rating.history?.[0] ?? null;
  return (
    <div className="mt-5 rounded-2xl bg-night-800 p-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">MMR</p>
          <p className="text-2xl leading-none font-bold tabular-nums text-slate-100">
            {formatMmr(rating.mmr)}
            {last ? (
              <span className={cn("ml-2 text-sm font-semibold", deltaColor(last.delta))}>{formatMmrDelta(last.delta)}</span>
            ) : null}
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>
            {rating.rank}º · {rating.gameDays} {pelada}
          </p>
          {rating.peak !== null ? <p>pico {formatMmr(rating.peak)}</p> : null}
        </div>
      </div>

      {rating.history && rating.history.length > 0 ? (
        <ul className="mt-3 grid gap-1.5">
          {rating.history.map((entry) => (
            <HistoryRow
              key={entry.gameDayId}
              entry={entry}
              open={openGameDayId === entry.gameDayId}
              onToggle={() => toggle(entry.gameDayId)}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
