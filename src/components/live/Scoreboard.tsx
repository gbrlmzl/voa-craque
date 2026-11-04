"use client";

import { formatClock } from "@/lib/match-engine";
import { MATCH_STATUS_LABEL, teamColor } from "@/lib/labels";
import { cn } from "@/components/ui";
import { FixedDigits } from "@/components/live/FixedDigits";
import { useTeamName } from "@/components/providers/PreferencesProvider";
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
  const teamName = useTeamName();
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

      {/* Coluna do meio fixa: o status muda de tamanho ("Pronta para comecar" -> "Pausada") e nao pode empurrar as laterais. */}
      <div className="grid grid-cols-[minmax(0,1fr)_7.5rem_minmax(0,1fr)] items-center gap-2">
        <div className="text-center">
          <p className={cn("truncate text-sm font-semibold", home.text)}>{teamName(match.home.name)}</p>
          <FixedDigits value={String(match.homeScore)} className="h-12 text-5xl leading-none font-black" />
        </div>

        <div className="text-center">
          <FixedDigits
            value={formatClock(remainingMs)}
            className={cn(
              "h-9 text-3xl leading-none font-black",
              lowTime ? "text-rose-400" : "text-slate-200",
            )}
          />
          <p className="mt-0.5 h-4 truncate text-[11px] leading-4 whitespace-nowrap text-slate-500">
            {MATCH_STATUS_LABEL[match.status]}
          </p>
        </div>

        <div className="text-center">
          <p className={cn("truncate text-sm font-semibold", away.text)}>{teamName(match.away.name)}</p>
          <FixedDigits value={String(match.awayScore)} className="h-12 text-5xl leading-none font-black" />
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-slate-500">
        {goalsToWin} {goalsToWin === 1 ? "gol encerra" : "gols encerram"} a partida
      </p>
    </div>
  );
}
