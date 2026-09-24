"use client";

import { ChevronDown, Search } from "lucide-react";
import { Avatar, Stars } from "@/components/Player";
import { Button, Card, EmptyState, Input, cn } from "@/components/ui";
import { type EvaluationPlayer, usePlayerEvaluation } from "@/hooks/usePlayerEvaluation";
import { usePlayerEvaluationRow } from "@/hooks/usePlayerEvaluationRow";

export type { EvaluationPlayer } from "@/hooks/usePlayerEvaluation";

const STAR_STEPS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

export function PlayerEvaluation({ players }: { players: EvaluationPlayer[] }) {
  const { query, setQuery, openId, toggle, filtered, unrated } = usePlayerEvaluation(players);

  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-500" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar jogador"
          className="pl-9"
        />
      </div>

      {unrated > 0 ? (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          {unrated} {unrated === 1 ? "jogador ainda não tem" : "jogadores ainda não têm"} estrelas. Sem
          isso, o sorteio usa a mediana do grupo.
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState title="Nenhum jogador encontrado" />
      ) : (
        filtered.map((player) => (
          <PlayerRow
            key={player.userId}
            player={player}
            expanded={openId === player.userId}
            onToggle={() => toggle(player.userId)}
          />
        ))
      )}
    </div>
  );
}

function PlayerRow({
  player,
  expanded,
  onToggle,
}: {
  player: EvaluationPlayer;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { stars, setStars, saving, dirty, save } = usePlayerEvaluationRow(player);

  return (
    <Card className="p-3">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 text-left">
        <Avatar name={player.name} photoUrl={player.photoUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-100">{player.name}</p>
          <p className="truncate text-xs text-slate-500">{player.positionLabel}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Stars value={player.stars} size={13} />
          </div>
        </div>
        <ChevronDown size={18} className={cn("shrink-0 text-slate-500 transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded ? (
        <div className="mt-4 grid gap-4 border-t border-white/10 pt-4">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">Estrelas</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setStars(null)}
                className={cn(
                  "h-10 rounded-xl border px-3 text-sm",
                  stars === null
                    ? "border-slate-400 bg-white/10 text-slate-100"
                    : "border-white/10 bg-night-800 text-slate-400",
                )}
              >
                sem nota
              </button>
              {STAR_STEPS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStars(value)}
                  className={cn(
                    "h-10 w-12 rounded-xl border text-sm font-semibold tabular-nums",
                    stars === value
                      ? "border-amber-400 bg-amber-400/15 text-amber-300"
                      : "border-white/10 bg-night-800 text-slate-400",
                  )}
                >
                  {value.toFixed(1).replace(".", ",")}
                </button>
              ))}
            </div>
          </div>

          <Button size="lg" onClick={save} disabled={saving || !dirty}>
            {saving ? "Salvando..." : "Salvar avaliação"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
