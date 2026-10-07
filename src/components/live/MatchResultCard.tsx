"use client";

import type { ReactNode } from "react";
import { Card, cn } from "@/components/ui";
import { useTeamName } from "@/components/providers/PreferencesProvider";
import { MATCH_END_REASON_LABEL, teamColor } from "@/lib/labels";
import { formatClock, matchMinute } from "@/lib/match-engine";
import type { FinishedMatch } from "@/services/live";

/**
 * Resultado da partida que acabou: ocupa o lugar do placar enquanto a proxima
 * nao comeca. Traz o placar final, quem fez cada gol (e quem deu a assistencia),
 * a duracao e quem joga em seguida. `children` e o fechamento do cartao: o botao
 * "Proxima partida" no painel, nada na tela do espectador.
 */
export function MatchResultCard({
  result,
  next,
  children,
}: {
  result: FinishedMatch;
  /** Quem joga a seguir; null quando nao ha proxima partida montada. */
  next: { homeName: string; awayName: string } | null;
  children?: ReactNode;
}) {
  const teamName = useTeamName();
  const home = teamColor(result.homeName);
  const away = teamColor(result.awayName);

  return (
    <Card className="grid gap-4 border-pitch-500/40 bg-pitch-500/10">
      <div>
        <p className="text-xs tracking-wide text-pitch-300 uppercase">
          Partida {result.orderIndex} · {result.endReason ? MATCH_END_REASON_LABEL[result.endReason] : "Encerrada"}
        </p>
        <p className="mt-1 text-xl font-bold">
          {result.result === "DRAW"
            ? "Empate — os dois saem"
            : `${teamName(result.winnerName ?? "?")} venceu`}
        </p>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
        <div>
          <p className={cn("text-sm font-semibold", home.text)}>{teamName(result.homeName)}</p>
          <p className="text-5xl font-black tabular-nums">{result.homeScore}</p>
        </div>
        <p className="text-2xl font-bold text-slate-500">x</p>
        <div>
          <p className={cn("text-sm font-semibold", away.text)}>{teamName(result.awayName)}</p>
          <p className="text-5xl font-black tabular-nums">{result.awayScore}</p>
        </div>
      </div>

      <section className="grid gap-1.5">
        <p className="text-sm font-medium text-slate-300">Gols</p>
        {result.goals.length === 0 ? (
          <p className="text-sm text-slate-400">Sem gols nesta partida.</p>
        ) : (
          <ul className="grid gap-1.5">
            {result.goals.map((goal) => (
              <li key={goal.id} className="flex items-baseline gap-2 text-sm">
                <span className="w-9 shrink-0 text-xs text-slate-500 tabular-nums">
                  {matchMinute(goal.elapsedMs)}&apos;
                </span>
                <span aria-hidden>⚽</span>
                <span className="min-w-0 flex-1 leading-snug">
                  <span className="font-medium text-slate-100">{goal.playerName}</span>
                  {goal.assistName ? (
                    <span className="text-slate-400"> · assistência de {goal.assistName}</span>
                  ) : (
                    <span className="text-slate-500"> · individual</span>
                  )}
                </span>
                <span className={cn("shrink-0 text-xs", teamColor(goal.teamName).text)}>
                  {teamName(goal.teamName)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <dl className="grid gap-1 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-400">Tempo de jogo</dt>
          <dd className="font-medium tabular-nums text-slate-100">{formatClock(result.playedMs)}</dd>
        </div>
        {next ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-slate-400">Próxima partida</dt>
            <dd className="font-medium text-slate-100">
              {teamName(next.homeName)} x {teamName(next.awayName)}
            </dd>
          </div>
        ) : null}
      </dl>

      {children}
    </Card>
  );
}
