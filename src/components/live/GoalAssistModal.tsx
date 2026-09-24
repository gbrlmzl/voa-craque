"use client";

import { Avatar } from "@/components/Player";
import { Button, Card } from "@/components/ui";
import type { LivePlayer, LiveTeam } from "@/services/live";

/**
 * Surge assim que um gol e marcado, com a partida ja pausada. O organizador
 * escolhe quem deu a assistencia (ou "Individual") antes de retomar o jogo.
 */
export function GoalAssistModal({
  team,
  scorer,
  busy,
  onConfirm,
  onCancel,
}: {
  team: LiveTeam;
  scorer: LivePlayer;
  busy: boolean;
  onConfirm: (assist: LivePlayer | null) => void;
  onCancel: () => void;
}) {
  const teammates = team.players.filter((player) => player.userId !== scorer.userId);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-4 sm:place-items-center"
    >
      <Card className="grid w-full max-w-sm gap-3 border-white/15">
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-pitch-500/20 text-xl ring-1 ring-pitch-500/40">
            ⚽
          </span>
          <div className="min-w-0">
            <p className="text-xs text-slate-400">Gol de</p>
            <p className="truncate font-semibold text-slate-100">{scorer.name}</p>
          </div>
        </div>

        <p className="text-sm font-medium text-slate-300">Assistência de?</p>

        <div className="grid max-h-64 gap-1.5 overflow-y-auto">
          {teammates.map((player) => (
            <button
              key={player.userId}
              type="button"
              disabled={busy}
              onClick={() => onConfirm(player)}
              className="flex items-center gap-2.5 rounded-xl bg-night-800/60 p-2 text-left transition-colors hover:bg-night-800 active:scale-[0.99] disabled:opacity-40"
            >
              <Avatar name={player.name} photoUrl={player.photoUrl} size="sm" />
              <span className="truncate text-sm font-medium text-slate-100">{player.name}</span>
            </button>
          ))}

          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm(null)}
            className="rounded-xl border border-dashed border-white/15 p-2.5 text-center text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 active:scale-[0.99] disabled:opacity-40"
          >
            Individual <span className="text-slate-500">(sem assistência)</span>
          </button>
        </div>

        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
      </Card>
    </div>
  );
}
