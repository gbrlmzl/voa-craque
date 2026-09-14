"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Avatar, Stars, usePlayerModal } from "@/components/player";
import { Card, EmptyState, cn } from "@/components/ui";
import { formatPercent } from "@/lib/labels";
import type { RankingRow } from "@/services/ranking";

type SortKey = keyof Pick<
  RankingRow,
  | "name"
  | "goals"
  | "assists"
  | "participations"
  | "played"
  | "won"
  | "drawn"
  | "lost"
  | "winRate"
  | "goalsPerMatch"
  | "gameDays"
  | "stars"
>;

const COLUMNS: { key: SortKey; label: string; title: string; numeric: boolean }[] = [
  { key: "name", label: "Jogador", title: "Nome", numeric: false },
  { key: "goals", label: "G", title: "Gols", numeric: true },
  { key: "assists", label: "A", title: "Assistências", numeric: true },
  { key: "participations", label: "G+A", title: "Participações em gol", numeric: true },
  { key: "played", label: "J", title: "Partidas jogadas", numeric: true },
  { key: "won", label: "V", title: "Vitórias", numeric: true },
  { key: "drawn", label: "E", title: "Empates", numeric: true },
  { key: "lost", label: "D", title: "Derrotas", numeric: true },
  { key: "winRate", label: "%V", title: "Aproveitamento", numeric: true },
  { key: "goalsPerMatch", label: "G/J", title: "Gols por partida", numeric: true },
  { key: "gameDays", label: "Peladas", title: "Peladas disputadas", numeric: true },
  { key: "stars", label: "Estrelas", title: "Avaliação do organizador", numeric: true },
];

export function RankingTable({ rows }: { rows: RankingRow[] }) {
  const { open } = usePlayerModal();
  const [sortKey, setSortKey] = useState<SortKey>("goals");
  const [descending, setDescending] = useState(true);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];

      if (typeof left === "string" || typeof right === "string") {
        const compare = String(left ?? "").localeCompare(String(right ?? ""), "pt-BR");
        return descending ? -compare : compare;
      }

      const compare = Number(left ?? -1) - Number(right ?? -1);
      return descending ? -compare : compare;
    });
    return copy;
  }, [rows, sortKey, descending]);

  function toggle(key: SortKey) {
    if (key === sortKey) {
      setDescending((value) => !value);
      return;
    }
    setSortKey(key);
    setDescending(key !== "name");
  }

  if (rows.length === 0) {
    return <EmptyState title="Sem números ainda" description="O ranking enche quando as partidas acabam." />;
  }

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[46rem] text-sm">
        <thead>
          <tr className="border-b border-white/10">
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "px-3 py-2 text-xs font-semibold text-slate-400",
                  column.numeric ? "text-center" : "text-left",
                  column.key === "name" && "sticky left-0 bg-night-900",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggle(column.key)}
                  title={column.title}
                  className={cn(
                    "inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-200",
                    sortKey === column.key && "text-pitch-400",
                  )}
                >
                  {column.label}
                  {sortKey === column.key ? (
                    descending ? (
                      <ArrowDown size={12} />
                    ) : (
                      <ArrowUp size={12} />
                    )
                  ) : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, index) => (
            <tr key={row.userId} className="border-b border-white/5 last:border-0 hover:bg-white/5">
              <td className="sticky left-0 bg-night-900 px-3 py-2">
                <button
                  type="button"
                  onClick={() => open(row.userId)}
                  className="flex min-w-0 items-center gap-2 text-left"
                >
                  <span className="w-4 shrink-0 text-xs text-slate-500 tabular-nums">{index + 1}</span>
                  <Avatar name={row.name} photoUrl={row.photoUrl} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-100">
                      {row.nickname || row.name}
                    </span>
                    {row.nickname ? (
                      <span className="block truncate text-[11px] text-slate-500">{row.name}</span>
                    ) : null}
                  </span>
                </button>
              </td>
              <td className="px-3 py-2 text-center font-semibold tabular-nums">{row.goals}</td>
              <td className="px-3 py-2 text-center tabular-nums">{row.assists}</td>
              <td className="px-3 py-2 text-center tabular-nums">{row.participations}</td>
              <td className="px-3 py-2 text-center tabular-nums">{row.played}</td>
              <td className="px-3 py-2 text-center tabular-nums">{row.won}</td>
              <td className="px-3 py-2 text-center tabular-nums">{row.drawn}</td>
              <td className="px-3 py-2 text-center tabular-nums">{row.lost}</td>
              <td className="px-3 py-2 text-center tabular-nums">
                {row.played > 0 ? formatPercent(row.winRate) : "—"}
              </td>
              <td className="px-3 py-2 text-center tabular-nums">
                {row.played > 0 ? row.goalsPerMatch.toFixed(2) : "—"}
              </td>
              <td className="px-3 py-2 text-center tabular-nums">{row.gameDays}</td>
              <td className="px-3 py-2">
                <div className="flex justify-center">
                  <Stars value={row.stars} size={12} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
