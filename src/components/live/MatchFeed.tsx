"use client";

import { Card } from "@/components/ui";
import { matchMinute } from "@/lib/match-engine";
import { buildMatchFeed } from "@/lib/substitution";
import type { LiveEvent, LiveSubstitution } from "@/services/live";

/**
 * Lances da partida: gols, assistencias e substituicoes na mesma lista, do mais
 * recente para o mais antigo. Usada no painel do organizador e na tela do espectador.
 */
export function MatchFeed({
  events,
  substitutions,
  limit,
}: {
  events: LiveEvent[];
  substitutions: LiveSubstitution[];
  limit?: number;
}) {
  const feed = buildMatchFeed(events, substitutions);
  const shown = limit ? feed.slice(0, limit) : feed;

  return (
    <Card className="grid gap-1 p-3">
      {shown.map((entry) =>
        entry.kind === "event" ? (
          <p key={`event-${entry.item.id}`} className="flex items-center gap-2 text-sm text-slate-300">
            <span className="w-11 shrink-0 text-xs text-slate-500 tabular-nums">
              {matchMinute(entry.item.elapsedMs)}&apos;
            </span>
            <span>{entry.item.type === "GOAL" ? "⚽" : "👟"}</span>
            <span className="truncate">{entry.item.playerName}</span>
            <span className="ml-auto shrink-0 text-xs text-slate-500">Time {entry.item.teamName}</span>
          </p>
        ) : (
          <p key={`sub-${entry.item.id}`} className="flex items-center gap-2 text-sm text-slate-300">
            <span className="w-11 shrink-0 text-xs text-slate-500 tabular-nums">
              {matchMinute(entry.item.elapsedMs)}&apos;
            </span>
            <span>🔁</span>
            <span className="truncate">
              <span className="text-pitch-300">Entra {entry.item.inName}</span>,{" "}
              <span className="text-rose-300">sai {entry.item.outName}</span>
            </span>
            <span className="ml-auto shrink-0 text-xs text-slate-500">Time {entry.item.teamName}</span>
          </p>
        ),
      )}
    </Card>
  );
}
