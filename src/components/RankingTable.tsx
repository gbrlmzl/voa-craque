"use client";

import { Avatar } from "@/components/Player";
import { usePlayerModal } from "@/components/providers/PlayerModalProvider";
import { Card, EmptyState, cn } from "@/components/ui";
import type { RankingRow } from "@/services/ranking";
import { CATEGORIES, useRankingTable } from "@/hooks/useRankingTable";

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
            className="flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/5"
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
              <span className="block truncate text-xs text-slate-500">{category.secondary(row)}</span>
            </span>
            <span className="shrink-0 text-lg font-bold tabular-nums text-slate-100">
              {category.format(row)}
            </span>
          </button>
        ))}
      </Card>
    </div>
  );
}
