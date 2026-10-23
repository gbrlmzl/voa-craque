"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Avatar, Stars } from "@/components/Player";
import { usePlayerModal } from "@/components/providers/PlayerModalProvider";
import { Card, EmptyState, cn } from "@/components/ui";
import { formatMmrDelta } from "@/lib/labels";
import type { RankingRow } from "@/services/ranking";
import { CATEGORIES, useRankingTable } from "@/hooks/useRankingTable";

/** Quantas posicoes o jogador subiu ou caiu por causa da ultima pelada. */
function RankMovement({ row }: { row: RankingRow }) {
  if (row.mmrTrend === null || row.mmrRankChange === null) return null;
  const up = row.mmrTrend === "up";
  const down = row.mmrTrend === "down";
  const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
  const places = Math.abs(row.mmrRankChange);
  const label = up
    ? `Subiu ${places} ${places === 1 ? "posição" : "posições"} na última pelada`
    : down
      ? `Caiu ${places} ${places === 1 ? "posição" : "posições"} na última pelada`
      : "Manteve a posição na última pelada";
  return (
    <span
      className={cn(
        "flex min-w-6 shrink-0 items-center justify-end gap-0.5 text-xs font-semibold tabular-nums",
        up ? "text-pitch-400" : down ? "text-rose-400" : "text-slate-500",
      )}
      aria-label={label}
    >
      <Icon size={13} aria-hidden />
      {places > 0 ? <span>{places}</span> : null}
    </span>
  );
}

export function RankingTable({ rows }: { rows: RankingRow[] }) {
  const { open } = usePlayerModal();
  const { categoryKey, setCategoryKey, category, sorted } = useRankingTable(rows);

  if (rows.length === 0) {
    return <EmptyState title="Sem números ainda" description="O ranking enche quando as partidas acabam." />;
  }

  return (
    <div className="grid gap-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {CATEGORIES.map((entry) => {
          const Icon = entry.icon;
          const active = entry.key === categoryKey;
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => setCategoryKey(entry.key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium whitespace-nowrap",
                active
                  ? "border-pitch-500/40 bg-pitch-500/15 text-pitch-300"
                  : "border-white/10 bg-night-900 text-slate-400 hover:text-slate-200",
              )}
            >
              <Icon size={15} />
              {entry.label}
            </button>
          );
        })}
      </div>

      <Card className="grid gap-1 p-2">
        {sorted.map((row, index) => (
          <button
            key={row.userId}
            type="button"
            onClick={() => open(row.userId)}
            className="flex items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-white/5"
          >
            <span
              className={cn(
                "w-5 shrink-0 text-center text-xs font-semibold tabular-nums",
                index === 0 ? "text-amber-400" : index === 1 ? "text-slate-300" : index === 2 ? "text-orange-400" : "text-slate-500",
              )}
            >
              {index + 1}
            </span>
            <Avatar name={row.name} photoUrl={row.photoUrl} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-slate-100">{row.nickname || row.name}</span>
              {categoryKey === "mmr" ? (
                // A estrela e a do perfil (avaliacao do organizador), nao uma derivada do MMR.
                // Sem espaco no celular, a segunda parte desce para a linha de baixo em vez de truncar.
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <Stars value={row.stars} size={13} hideEmpty />
                  <span className="whitespace-nowrap">· {category.secondary(row)}</span>
                </span>
              ) : (
                <span className="block truncate text-xs text-slate-500">{category.secondary(row)}</span>
              )}
            </span>
            {categoryKey === "mmr" && <RankMovement row={row} />}
            <span className="shrink-0 text-right">
              <span className="block text-lg font-bold tabular-nums text-slate-100">{category.format(row)}</span>
              {/* Pontos da ultima pelada: so o organizador (row.mmrDelta vem nulo para os demais). */}
              {categoryKey === "mmr" && row.mmrDelta !== null ? (
                <span
                  className={cn(
                    "block text-xs font-semibold tabular-nums",
                    Math.round(row.mmrDelta) > 0
                      ? "text-pitch-400"
                      : Math.round(row.mmrDelta) < 0
                        ? "text-rose-400"
                        : "text-slate-500",
                  )}
                >
                  {formatMmrDelta(row.mmrDelta)}
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </Card>
    </div>
  );
}
