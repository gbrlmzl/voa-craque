"use client";

import { useMemo, useState } from "react";
import { CalendarCheck, Handshake, Percent, Target } from "lucide-react";
import { Avatar, usePlayerModal } from "@/components/player";
import { Card, EmptyState, cn } from "@/components/ui";
import { formatPercent } from "@/lib/labels";
import type { RankingRow } from "@/services/ranking";

type CategoryKey = "goals" | "assists" | "winRate" | "gameDays";

type Category = {
  key: CategoryKey;
  label: string;
  icon: typeof Target;
  format: (row: RankingRow) => string;
  secondary: (row: RankingRow) => string;
  sort: (rows: RankingRow[]) => RankingRow[];
};

const CATEGORIES: Category[] = [
  {
    key: "goals",
    label: "Artilharia",
    icon: Target,
    format: (row) => String(row.goals),
    secondary: (row) => `${row.played} ${row.played === 1 ? "jogo" : "jogos"}`,
    sort: (rows) => [...rows].sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name, "pt-BR")),
  },
  {
    key: "assists",
    label: "Assistências",
    icon: Handshake,
    format: (row) => String(row.assists),
    secondary: (row) => `${row.played} ${row.played === 1 ? "jogo" : "jogos"}`,
    sort: (rows) => [...rows].sort((a, b) => b.assists - a.assists || a.name.localeCompare(b.name, "pt-BR")),
  },
  {
    key: "winRate",
    label: "Aproveitamento",
    icon: Percent,
    format: (row) => (row.played > 0 ? formatPercent(row.winRate) : "—"),
    secondary: (row) => `${row.won}V ${row.drawn}E ${row.lost}D`,
    sort: (rows) =>
      [...rows].sort(
        (a, b) => b.winRate - a.winRate || b.played - a.played || a.name.localeCompare(b.name, "pt-BR"),
      ),
  },
  {
    key: "gameDays",
    label: "Presença",
    icon: CalendarCheck,
    format: (row) => String(row.gameDays),
    secondary: (row) => `${row.gameDays === 1 ? "pelada disputada" : "peladas disputadas"}`,
    sort: (rows) =>
      [...rows].sort((a, b) => b.gameDays - a.gameDays || a.name.localeCompare(b.name, "pt-BR")),
  },
];

export function RankingTable({ rows }: { rows: RankingRow[] }) {
  const { open } = usePlayerModal();
  const [categoryKey, setCategoryKey] = useState<CategoryKey>("goals");

  const category = CATEGORIES.find((entry) => entry.key === categoryKey)!;
  const sorted = useMemo(() => category.sort(rows), [category, rows]);

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
