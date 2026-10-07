"use client";

import { useEffect, useRef } from "react";
import { ArrowLeftRight, ChevronRight, Pause, Play, Square } from "lucide-react";
import { Avatar } from "@/components/Player";
import { Badge, Button, Card, EmptyState, SectionTitle, cn } from "@/components/ui";
import { MATCH_END_REASON_LABEL, teamColor } from "@/lib/labels";
import type { LiveMatch, LivePlayer, LiveSnapshot, LiveTeam } from "@/services/live";
import { FinishGameDayButton } from "@/components/gameday/FinishGameDayButton";
import { GoalAssistModal } from "@/components/live/GoalAssistModal";
import { MatchFeed } from "@/components/live/MatchFeed";
import { Scoreboard } from "@/components/live/Scoreboard";
import { SubstitutionModal } from "@/components/live/SubstitutionModal";
import { useLivePanel } from "@/hooks/useLivePanel";

export function LivePanel({ gameDayId, initial }: { gameDayId: string; initial: LiveSnapshot }) {
  const {
    snapshot,
    match,
    remainingMs,
    streaming,
    busy,
    finished,
    showResult,
    showResumeHint,
    dismissResumeHint,
    pendingGoal,
    startGoal,
    confirmGoal,
    cancelGoal,
    pendingSubstitution,
    startSubstitution,
    confirmSubstitution,
    cancelSubstitution,
    changeState,
    dismissFinish,
  } = useLivePanel(gameDayId, initial);

  // Com um modal aberto, o resto do painel nao aceita toque.
  const modalOpen = !!pendingGoal || !!pendingSubstitution;

  // O teclado e o leitor de tela vao direto para o botao que o organizador precisa tocar.
  const resumeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (showResumeHint) resumeButton.current?.focus();
  }, [showResumeHint]);

  return (
    <div className="grid gap-4">
      {/* Escurece o resto da tela; o toque so tira o destaque e nao aciona o que esta embaixo. */}
      {showResumeHint ? (
        <div aria-hidden onClick={dismissResumeHint} className="fade-in fixed inset-0 z-45 bg-black/60" />
      ) : null}

      {match ? (
        // Acima do escurecido (z-45) so enquanto o destaque vale; o toast (z-60) fica acima de tudo.
        <div
          className={cn(
            "sticky top-14 -mx-4 bg-night-950/95 px-4 pt-1 pb-3 backdrop-blur",
            showResumeHint ? "z-46" : "z-30",
          )}
        >
          <div className={cn(showResumeHint && "opacity-70")}>
            <Scoreboard
              match={match}
              remainingMs={remainingMs}
              goalsToWin={snapshot.gameDay.goalsToWin}
              streaming={streaming}
            />
          </div>

          {showResumeHint ? (
            <p role="status" className="mt-2 text-center text-sm font-medium text-pitch-300">
              Cronômetro parado. Toque em Retomar.
            </p>
          ) : null}

          {!finished ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {match.status === "SCHEDULED" ? (
                <Button
                  size="lg"
                  className="col-span-2"
                  onClick={() => changeState("START")}
                  disabled={busy || modalOpen}
                >
                  <Play size={20} /> Iniciar partida
                </Button>
              ) : null}

              {match.status === "RUNNING" ? (
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => changeState("PAUSE")}
                  disabled={busy || modalOpen}
                >
                  <Pause size={20} /> Pausar
                </Button>
              ) : null}

              {match.status === "PAUSED" ? (
                <Button
                  ref={resumeButton}
                  size="lg"
                  className={cn(showResumeHint && "resume-attention")}
                  onClick={() => changeState("RESUME")}
                  disabled={busy || remainingMs <= 0 || modalOpen}
                >
                  <Play size={20} /> Retomar
                </Button>
              ) : null}

              {match.status === "RUNNING" || match.status === "PAUSED" ? (
                <Button
                  variant="secondary"
                  size="lg"
                  className={cn(showResumeHint && "pointer-events-none opacity-30")}
                  onClick={() => changeState("END")}
                  disabled={busy || modalOpen}
                >
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
            disabled={busy || match.status === "SCHEDULED" || modalOpen}
            substitutionDisabled={busy || finished || modalOpen}
            onGoal={startGoal}
            onSubstitution={startSubstitution}
          />
          <TeamPanel
            team={match.away}
            match={match}
            disabled={busy || match.status === "SCHEDULED" || modalOpen}
            substitutionDisabled={busy || finished || modalOpen}
            onGoal={startGoal}
            onSubstitution={startSubstitution}
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

      {match && (match.events.length > 0 || match.substitutions.length > 0) ? (
        <section>
          <SectionTitle>Lances</SectionTitle>
          <MatchFeed events={match.events} substitutions={match.substitutions} limit={12} />
        </section>
      ) : null}

      {!finished ? (
        <section>
          <SectionTitle>Fim de papo</SectionTitle>
          <FinishGameDayButton gameDayId={gameDayId} className="w-full" />
        </section>
      ) : null}

      {pendingGoal ? (
        <GoalAssistModal
          team={pendingGoal.team}
          scorer={pendingGoal.player}
          busy={busy}
          onConfirm={confirmGoal}
          onCancel={cancelGoal}
        />
      ) : null}

      {pendingSubstitution && match ? (
        <SubstitutionModal
          team={pendingSubstitution.team}
          match={match}
          queue={snapshot.queue}
          busy={busy}
          onConfirm={confirmSubstitution}
          onCancel={cancelSubstitution}
        />
      ) : null}
    </div>
  );
}

function TeamPanel({
  team,
  match,
  disabled,
  substitutionDisabled,
  onGoal,
  onSubstitution,
}: {
  team: LiveTeam;
  match: LiveMatch;
  disabled: boolean;
  substitutionDisabled: boolean;
  onGoal: (team: LiveTeam, player: LivePlayer) => void;
  onSubstitution: (team: LiveTeam) => void;
}) {
  const palette = teamColor(team.name);
  const score = team.id === match.home.id ? match.homeScore : match.awayScore;

  return (
    <Card className={cn("border p-3", palette.border)}>
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("flex items-center gap-2 font-semibold", palette.text)}>
          <span className={cn("h-2.5 w-2.5 rounded-full", palette.dot)} /> Time {team.name}
        </span>
        <Button
          variant="secondary"
          size="sm"
          className="touch-target ml-auto"
          disabled={substitutionDisabled}
          onClick={() => onSubstitution(team)}
        >
          <ArrowLeftRight size={16} aria-hidden /> Substituição
        </Button>
        <span className="min-w-8 text-right text-2xl font-black tabular-nums">{score}</span>
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
              onClick={() => onGoal(team, player)}
              aria-label={`Gol de ${player.name}`}
              className="ball-glow touch-target grid place-items-center rounded-xl bg-pitch-500/20 text-2xl ring-1 ring-pitch-500/40 transition-transform active:scale-90 disabled:opacity-40 disabled:ring-white/10"
            >
              ⚽
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
