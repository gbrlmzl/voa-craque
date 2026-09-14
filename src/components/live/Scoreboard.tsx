"use client";

import { formatClock } from "@/lib/match-engine";
import { MATCH_STATUS_LABEL, teamColor } from "@/lib/labels";
import { cn } from "@/components/ui";
import type { LiveMatch } from "@/services/live";

export function Scoreboard({
  match,
  remainingMs,
  goalsToWin,
  streaming,
}: {
  match: LiveMatch;
  remainingMs: number;
  goalsToWin: number;
  streaming: boolean;
}) {
  const home = teamColor(match.home.name);
  const away = teamColor(match.away.name);
  const lowTime = remainingMs <= 60_000 && match.status === "RUNNING";

  return (
    <div className="rounded-2xl border border-white/10 bg-night-900 p-4">
      <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
        <span>Partida {match.orderIndex}</span>
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              streaming ? "bg-pitch-400 pulse-live" : "bg-slate-500",
            )}
          />
          {streaming ? "ao vivo" : "reconectando"}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="text-center">
          <p className={cn("text-sm font-semibold", home.text)}>Time {match.home.name}</p>
          <p className="text-5xl font-black tabular-nums">{match.homeScore}</p>
        </div>

        <div className="text-center">
          <p
            className={cn(
              "text-3xl font-black tabular-nums",
              lowTime ? "text-rose-400" : "text-slate-200",
            )}
          >
            {formatClock(remainingMs)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">{MATCH_STATUS_LABEL[match.status]}</p>
        </div>

        <div className="text-center">
          <p className={cn("text-sm font-semibold", away.text)}>Time {match.away.name}</p>
          <p className="text-5xl font-black tabular-nums">{match.awayScore}</p>
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-slate-500">
        {goalsToWin} {goalsToWin === 1 ? "gol encerra" : "gols encerram"} a partida
      </p>
    </div>
  );
}
