"use client";

import { PlayerChip } from "@/components/Player";
import { Badge, Card, EmptyState, SectionTitle, cn } from "@/components/ui";
import { MATCH_END_REASON_LABEL, teamColor } from "@/lib/labels";
import { matchMinute } from "@/lib/match-engine";
import type { LiveSnapshot, LiveTeam } from "@/services/live";
import { Scoreboard } from "@/components/live/Scoreboard";
import { useCountdown, useLive } from "@/hooks/useLive";

/** Tela de quem espera na fila: leitura pura, sem nenhum botao de acao. */
export function LiveBoard({ gameDayId, initial }: { gameDayId: string; initial: LiveSnapshot }) {
  const { snapshot, receivedAt, streaming } = useLive(gameDayId, initial);
  const remainingMs = useCountdown(snapshot.match, receivedAt);
  const match = snapshot.match;

  if (snapshot.gameDay.status === "FINISHED") {
    return (
      <div className="grid gap-4">
        <Card>
          <p className="font-semibold">A pelada de hoje acabou</p>
          <p className="mt-1 text-sm text-slate-400">
            Os números já entraram no ranking. Até a próxima.
          </p>
        </Card>
        <Standings snapshot={snapshot} />
      </div>
    );
  }

  if (!match) {
    return (
      <EmptyState
        title="Ainda não rolou nada"
        description="Assim que o organizador montar os times, a partida aparece aqui."
      />
    );
  }

  return (
    <div className="grid gap-4">
      <Scoreboard
        match={match}
        remainingMs={remainingMs}
        goalsToWin={snapshot.gameDay.goalsToWin}
        streaming={streaming}
      />

      {snapshot.lastFinished && match.status === "SCHEDULED" ? (
        <Card className="border-white/15">
          <p className="text-xs tracking-wide text-slate-400 uppercase">
            {snapshot.lastFinished.endReason
              ? MATCH_END_REASON_LABEL[snapshot.lastFinished.endReason]
              : "Resultado"}
          </p>
          <p className="mt-1 font-semibold">
            {snapshot.lastFinished.result === "DRAW"
              ? "Empate — os dois saíram"
              : `Time ${snapshot.lastFinished.winnerName} venceu`}
          </p>
          <p className="text-sm text-slate-400">
            Time {snapshot.lastFinished.homeName} {snapshot.lastFinished.homeScore} x{" "}
            {snapshot.lastFinished.awayScore} Time {snapshot.lastFinished.awayName}
          </p>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <TeamCard team={match.home} />
        <TeamCard team={match.away} />
      </div>

      <section>
        <SectionTitle hint={`${snapshot.queue.length} esperando`}>Fila</SectionTitle>
        {snapshot.queue.length === 0 ? (
          <EmptyState title="Ninguém na fila" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {snapshot.queue.map((team, index) => (
              <Badge key={team.id} className={cn("text-sm", teamColor(team.name).text)}>
                {index + 1}º · Time {team.name}
              </Badge>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>Lances</SectionTitle>
        {match.events.length === 0 ? (
          <EmptyState title="Nada marcado ainda" />
        ) : (
          <Card className="grid gap-1 p-3">
            {match.events.map((event) => (
              <p key={event.id} className="flex items-center gap-2 text-sm text-slate-300">
                <span className="w-11 shrink-0 text-xs text-slate-500 tabular-nums">
                  {matchMinute(event.elapsedMs)}&apos;
                </span>
                <span>{event.type === "GOAL" ? "⚽" : "👟"}</span>
                <span className="truncate">{event.playerName}</span>
                <span className="ml-auto shrink-0 text-xs text-slate-500">Time {event.teamName}</span>
              </p>
            ))}
          </Card>
        )}
      </section>

      <Standings snapshot={snapshot} />
    </div>
  );
}

function TeamCard({ team }: { team: LiveTeam }) {
  const palette = teamColor(team.name);
  return (
    <Card className={cn("border", palette.border)}>
      <p className={cn("mb-2 flex items-center gap-2 font-semibold", palette.text)}>
        <span className={cn("h-2.5 w-2.5 rounded-full", palette.dot)} /> Time {team.name}
      </p>
      <div className="grid gap-0.5">
        {team.players.map((player) => (
          <PlayerChip
            key={player.userId}
            userId={player.userId}
            name={player.name}
            photoUrl={player.photoUrl}
            subtitle={`${player.goals} ${player.goals === 1 ? "gol" : "gols"} · ${player.assists} ${
              player.assists === 1 ? "assistência" : "assistências"
            }`}
          />
        ))}
      </div>
    </Card>
  );
}

function Standings({ snapshot }: { snapshot: LiveSnapshot }) {
  const rows = snapshot.standings.filter((row) => row.played > 0);
  if (rows.length === 0) return null;

  return (
    <section>
      <SectionTitle>Como estão os times</SectionTitle>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-slate-500">
              <th className="px-3 py-2">Time</th>
              <th className="px-2 py-2 text-center">J</th>
              <th className="px-2 py-2 text-center">V</th>
              <th className="px-2 py-2 text-center">E</th>
              <th className="px-2 py-2 text-center">D</th>
              <th className="px-3 py-2 text-center">Gols</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.teamId} className="border-b border-white/5 last:border-0">
                <td className={cn("px-3 py-2 font-medium", teamColor(row.name).text)}>Time {row.name}</td>
                <td className="px-2 py-2 text-center tabular-nums">{row.played}</td>
                <td className="px-2 py-2 text-center tabular-nums">{row.won}</td>
                <td className="px-2 py-2 text-center tabular-nums">{row.drawn}</td>
                <td className="px-2 py-2 text-center tabular-nums">{row.lost}</td>
                <td className="px-3 py-2 text-center tabular-nums">
                  {row.goalsFor}:{row.goalsAgainst}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
