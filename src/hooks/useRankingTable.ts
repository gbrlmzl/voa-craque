"use client";

import { useMemo, useState } from "react";
import { CalendarCheck, Handshake, Percent, Target } from "lucide-react";
import { formatPercent } from "@/lib/labels";
import type { RankingRow } from "@/services/ranking";

export type CategoryKey = "goals" | "assists" | "winRate" | "gameDays";

export type Category = {
  key: CategoryKey;
  label: string;
  icon: typeof Target;
  format: (row: RankingRow) => string;
  secondary: (row: RankingRow) => string;
  sort: (rows: RankingRow[]) => RankingRow[];
};

export const CATEGORIES: Category[] = [
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

export function useRankingTable(rows: RankingRow[]) {
  const [categoryKey, setCategoryKey] = useState<CategoryKey>("goals");

  const category = CATEGORIES.find((entry) => entry.key === categoryKey)!;
  const sorted = useMemo(() => category.sort(rows), [category, rows]);

  return { categoryKey, setCategoryKey, category, sorted };
}
