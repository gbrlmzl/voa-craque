"use client";

import { ChevronRight, Footprints, Pause, Play, Square } from "lucide-react";
import { Avatar } from "@/components/Player";
import { Badge, Button, Card, EmptyState, SectionTitle, cn } from "@/components/ui";
import { MATCH_END_REASON_LABEL, teamColor } from "@/lib/labels";
import type { LiveMatch, LivePlayer, LiveSnapshot, LiveTeam } from "@/services/live";
import { FinishGameDayButton } from "@/components/gameday/FinishGameDayButton";
import { Scoreboard } from "@/components/live/Scoreboard";
import { useLivePanel } from "@/hooks/useLivePanel";

export function LivePanel({ gameDayId, initial }: { gameDayId: string; initial: LiveSnapshot }) {
  const { snapshot, match, remainingMs, streaming, busy, finished, showResult, record, changeState, dismissFinish } =
    useLivePanel(gameDayId, initial);

  return (
    <div className="grid gap-4">
      {match ? (
        <div className="sticky top-14 z-30 -mx-4 bg-night-950/95 px-4 pt-1 pb-3 backdrop-blur">
          <Scoreboard
            match={match}
            remainingMs={remainingMs}
            goalsToWin={snapshot.gameDay.goalsToWin}
            streaming={streaming}
          />

          {!finished ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {match.status === "SCHEDULED" ? (
                <Button size="lg" className="col-span-2" onClick={() => changeState("START")} disabled={busy}>
                  <Play size={20} /> Iniciar partida
                </Button>
              ) : null}

              {match.status === "RUNNING" ? (
                <Button variant="secondary" size="lg" onClick={() => changeState("PAUSE")} disabled={busy}>
                  <Pause size={20} /> Pausar
                </Button>
              ) : null}

              {match.status === "PAUSED" ? (
                <Button size="lg" onClick={() => changeState("RESUME")} disabled={busy || remainingMs <= 0}>
                  <Play size={20} /> Retomar
                </Button>
              ) : null}

              {match.status === "RUNNING" || match.status === "PAUSED" ? (
                <Button variant="secondary" size="lg" onClick={() => changeState("END")} disabled={busy}>
                  <Square size={18} /> Encerrar partida
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {showResult && snapshot.lastFinished ? (
        <Card className="border-pitch-500/40 bg-pitch-500/10">
          <p className="text-xs tracking-wide text-pitch-300 uppercase">
            {snapshot.lastFinished.endReason
              ? MATCH_END_REASON_LABEL[snapshot.lastFinished.endReason]
              : "Resultado"}
          </p>
          <p className="mt-1 text-xl font-bold">
            {snapshot.lastFinished.result === "DRAW"
              ? "Empate — os dois saem"
              : `Time ${snapshot.lastFinished.winnerName} venceu`}
          </p>
          <p className="mt-0.5 text-sm text-slate-300">
            Time {snapshot.lastFinished.homeName} {snapshot.lastFinished.homeScore} x{" "}
            {snapshot.lastFinished.awayScore} Time {snapshot.lastFinished.awayName}
          </p>

          {match && match.status === "SCHEDULED" ? (
            <Button size="lg" className="mt-3 w-full" onClick={dismissFinish}>
              Próxima partida <ChevronRight size={18} />
            </Button>
          ) : (
            <p className="mt-3 text-sm text-slate-300">Não há próxima partida montada.</p>
          )}
        </Card>
      ) : null}

      {finished ? (
        <Card>
          <p className="font-semibold">Pelada encerrada</p>
          <p className="mt-1 text-sm text-slate-400">
            As estatísticas foram contabilizadas e a fila foi zerada.
          </p>
        </Card>
      ) : null}

      {match && !showResult && !finished ? (
        <div className="grid gap-3">
          <TeamPanel
            team={match.home}
            match={match}
            disabled={busy || match.status === "SCHEDULED"}
            onRecord={record}
          />
          <TeamPanel
            team={match.away}
            match={match}
            disabled={busy || match.status === "SCHEDULED"}
            onRecord={record}
          />
        </div>
      ) : null}

      {!match && !finished ? (
        <EmptyState
          title="Nenhuma partida montada"
          description="Monte os times da pelada para liberar o painel."
        />
      ) : null}

      <section>
        <SectionTitle hint={`${snapshot.queue.length} esperando`}>Fila</SectionTitle>
        {snapshot.queue.length === 0 ? (
          <EmptyState title="Ninguém na fila" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {snapshot.queue.map((team, index) => {
              const palette = teamColor(team.name);
              return (
                <Badge key={team.id} tone="neutral" className={cn("text-sm", palette.text)}>
                  {index + 1}º · Time {team.name}
                </Badge>
              );
            })}
          </div>
        )}
      </section>

      {match && match.events.length > 0 ? (
        <section>
          <SectionTitle>Lances</SectionTitle>
          <Card className="grid gap-1 p-3">
            {match.events.slice(0, 12).map((event) => (
              <p key={event.id} className="flex items-center gap-2 text-sm text-slate-300">
                <span className="w-11 shrink-0 text-xs text-slate-500 tabular-nums">
                  {Math.floor(event.elapsedMs / 60000)}&apos;
                </span>
                <span>{event.type === "GOAL" ? "⚽" : "👟"}</span>
                <span className="truncate">{event.playerName}</span>
                <span className="ml-auto shrink-0 text-xs text-slate-500">Time {event.teamName}</span>
              </p>
            ))}
          </Card>
        </section>
      ) : null}

      {!finished ? (
        <section>
          <SectionTitle>Fim de papo</SectionTitle>
          <FinishGameDayButton gameDayId={gameDayId} className="w-full" />
        </section>
      ) : null}
    </div>
  );
}

function TeamPanel({
  team,
  match,
  disabled,
  onRecord,
}: {
  team: LiveTeam;
  match: LiveMatch;
  disabled: boolean;
  onRecord: (type: "GOAL" | "ASSIST", team: LiveTeam, player: LivePlayer) => void;
}) {
  const palette = teamColor(team.name);
  const score = team.id === match.home.id ? match.homeScore : match.awayScore;

  return (
    <Card className={cn("border p-3", palette.border)}>
      <div className="mb-2 flex items-center justify-between">
        <span className={cn("flex items-center gap-2 font-semibold", palette.text)}>
          <span className={cn("h-2.5 w-2.5 rounded-full", palette.dot)} /> Time {team.name}
        </span>
        <span className="text-2xl font-black tabular-nums">{score}</span>
      </div>

      <div className="grid gap-1.5">
        {team.players.map((player) => (
          <div key={player.userId} className="flex items-center gap-2 rounded-xl bg-night-800/60 p-1.5">
            <Avatar name={player.name} photoUrl={player.photoUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-100">{player.name}</p>
              <p className="text-[11px] text-slate-500">
                {player.isKeeper ? "Goleiro · " : ""}
                {player.goals} G · {player.assists} A
              </p>
            </div>

            <button
              type="button"
              disabled={disabled}
              onClick={() => onRecord("GOAL", team, player)}
              aria-label={`Gol de ${player.name}`}
              className="ball-glow touch-target grid place-items-center rounded-xl bg-pitch-500/20 text-2xl ring-1 ring-pitch-500/40 transition-transform active:scale-90 disabled:opacity-40 disabled:ring-white/10"
            >
              ⚽
            </button>

            <button
              type="button"
              disabled={disabled}
              onClick={() => onRecord("ASSIST", team, player)}
              aria-label={`Assistência de ${player.name}`}
              className="touch-target grid place-items-center rounded-xl bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30 transition-transform active:scale-90 disabled:opacity-40 disabled:ring-white/10"
            >
              <Footprints size={22} />
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
