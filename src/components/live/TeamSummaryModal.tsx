"use client";

import { Avatar } from "@/components/Player";
import { SkeletonBlock, SkeletonTeamSummary } from "@/components/Skeleton";
import { Badge, Modal, cn } from "@/components/ui";
import { TeamName } from "@/components/TeamName";
import { useTeamName } from "@/components/providers/PreferencesProvider";
import { useTeamSummary } from "@/hooks/useTeamSummary";
import { teamColor } from "@/lib/labels";
import type { TeamSummary } from "@/services/team-summary";

/**
 * Elenco e retrospecto de um time da fila, so para leitura (as linhas dos
 * jogadores nao abrem outro modal por cima deste). Serve ao painel do
 * organizador e a tela do espectador.
 */
export function TeamSummaryModal({
  gameDayId,
  team,
  refreshKey,
  expectedPlayers = 5,
  onClose,
}: {
  gameDayId: string;
  team: { id: string; name: string };
  /** Muda quando uma partida termina: o historico e buscado de novo. */
  refreshKey: string | null;
  /** Tamanho do time, para o skeleton ter o mesmo numero de linhas (o da pelada, se ja se sabe). */
  expectedPlayers?: number;
  onClose: () => void;
}) {
  const { summary, error, loading } = useTeamSummary(gameDayId, team.id, refreshKey);
  const palette = teamColor(team.name);

  const title = (
    <span className="flex flex-wrap items-center gap-2">
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", palette.dot)} />
      <span className={palette.text}>
        <TeamName name={team.name} />
      </span>
      {loading ? (
        // Reserva o lugar do selo (22px: text-xs de 1rem + py-0.5 + borda) para o titulo nao pular.
        <SkeletonBlock className="h-[22px] w-16 rounded-full" />
      ) : summary?.team.queuePosition ? (
        <Badge>{summary.team.queuePosition}º na fila</Badge>
      ) : null}
    </span>
  );

  return (
    // `my-auto` centraliza no celular, onde o Modal padrao encosta no rodape.
    <Modal title={title} onClose={onClose} className="my-auto flex max-h-[85dvh] flex-col">
      {loading ? <SkeletonTeamSummary players={Math.min(Math.max(expectedPlayers, 1), 8)} /> : null}
      {error ? <p className="py-8 text-center text-sm text-rose-400">{error}</p> : null}
      {summary ? <Body summary={summary} /> : null}
    </Modal>
  );
}

function Body({ summary }: { summary: TeamSummary }) {
  const teamName = useTeamName();
  const { record } = summary;

  return (
    <div className="-mx-1 grid min-h-0 content-start gap-4 overflow-y-auto px-1">
      <section className="grid gap-2">
        <div
          role="group"
          aria-label={`${record.played} jogos, ${record.won} vitórias, ${record.drawn} empates, ${record.lost} derrotas`}
          className="grid grid-cols-4 gap-2 rounded-2xl bg-night-800 p-3 text-center"
        >
          <Stat label="J" value={record.played} />
          <Stat label="V" value={record.won} />
          <Stat label="E" value={record.drawn} />
          <Stat label="D" value={record.lost} />
        </div>
        <p className="text-center text-xs text-slate-400">
          Gols: {record.goalsFor} pró, {record.goalsAgainst} contra
        </p>
      </section>

      <section className="grid gap-1.5">
        <SectionLabel>Jogadores</SectionLabel>
        {summary.players.map((player) => (
          <div key={player.userId} className="flex items-center gap-2.5 rounded-xl bg-night-800/60 p-2">
            <Avatar name={player.name} photoUrl={player.photoUrl} size="sm" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-slate-100">{player.name}</span>
              {player.isKeeper ? <span className="block text-[11px] text-slate-500">Goleiro</span> : null}
            </span>
          </div>
        ))}
      </section>

      <section className="grid gap-1.5">
        <SectionLabel>Nesta pelada</SectionLabel>
        {summary.history.length === 0 ? (
          <p className="text-sm text-slate-400">Ainda não jogou nesta pelada.</p>
        ) : (
          summary.history.map((entry) => {
            const opponent = teamName(entry.opponentName);
            const score = `${entry.goalsFor} x ${entry.goalsAgainst}`;
            const outcome =
              entry.outcome === "WIN"
                ? { text: `Venceu o ${opponent} por ${score}`, className: "text-pitch-300" }
                : entry.outcome === "LOSS"
                  ? { text: `Perdeu para o ${opponent} por ${score}`, className: "text-rose-300" }
                  : { text: `Empatou com o ${opponent}, ${score}`, className: "text-slate-300" };
            return (
              <p key={entry.matchId} className={cn("text-sm", outcome.className)}>
                Partida {entry.orderIndex} · {outcome.text}
              </p>
            );
          })
        )}
      </section>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <p className="text-sm font-medium text-slate-300">{children}</p>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}
