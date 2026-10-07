"use client";

import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Check } from "lucide-react";
import { Avatar } from "@/components/Player";
import { Button, Card, cn } from "@/components/ui";
import { teamColor } from "@/lib/labels";
import { useTeamName } from "@/components/providers/PreferencesProvider";
import {
  evaluateSubstitution,
  groupBench,
  permanentBlocker,
  type SubstitutionView,
} from "@/lib/substitution";
import type { LiveBenchPlayer, LiveMatch, LivePlayer, LiveTeam } from "@/services/live";

export type SubstitutionSelection = { outUserId: string; inUserId: string; permanent: boolean };

/**
 * Placa de substituicao do futebol: quem sai em cima, quem entra embaixo. Nao
 * pausa a partida (a troca no futsal e volante). As regras vem de
 * lib/substitution.ts, as mesmas que o servidor aplica, entao o modal nunca
 * oferece uma troca que seria recusada.
 */
export function SubstitutionModal({
  team,
  match,
  queue,
  busy,
  onConfirm,
  onCancel,
}: {
  team: LiveTeam;
  match: LiveMatch;
  queue: { id: string; name: string }[];
  busy: boolean;
  onConfirm: (selection: SubstitutionSelection) => void;
  onCancel: () => void;
}) {
  const teamName = useTeamName();
  const [outId, setOutId] = useState<string | null>(null);
  const [inId, setInId] = useState<string | null>(null);
  const [wantsPermanent, setWantsPermanent] = useState(false);

  const groups = groupBench(match.bench, team.id, queue.map((entry) => entry.id));
  const queueNames = new Map(queue.map((entry) => [entry.id, entry.name]));

  // A selecao so vale enquanto o jogador continua na lista: a partida muda ao vivo.
  const outPlayer = team.players.find((player) => player.userId === outId) ?? null;
  const inPlayer = match.bench.find((player) => player.userId === inId) ?? null;

  const view: SubstitutionView = {
    homeTeamId: match.home.id,
    awayTeamId: match.away.id,
    court: [match.home, match.away].flatMap((side) =>
      side.players.map((player) => ({ userId: player.userId, teamId: side.id })),
    ),
    bench: match.bench,
    rosters: { [match.home.id]: match.home.roster, [match.away.id]: match.away.roster },
  };

  const blocker =
    outPlayer && inPlayer
      ? permanentBlocker({
          teamId: team.id,
          teamRoster: team.roster,
          outUserId: outPlayer.userId,
          inPlayer,
        })
      : null;
  const permanent = wantsPermanent && !blocker;

  const check =
    outPlayer && inPlayer
      ? evaluateSubstitution(view, {
          teamId: team.id,
          outUserId: outPlayer.userId,
          inUserId: inPlayer.userId,
          permanent,
        })
      : null;
  const canConfirm = !busy && check?.ok === true;

  const palette = teamColor(team.name);
  const hasBench = groups.left.length + groups.queue.length + groups.reserves.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Substituição do ${teamName(team.name)}`}
      className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-4 sm:place-items-center"
    >
      <Card className="flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col gap-3 border-white/15 bg-night-900">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-slate-100">Substituição</p>
          <span className={cn("flex items-center gap-2 text-sm font-semibold", palette.text)}>
            <span className={cn("h-2.5 w-2.5 rounded-full", palette.dot)} /> {teamName(team.name)}
          </span>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2">
          <div className="min-w-0 rounded-xl bg-rose-500/10 p-2 ring-1 ring-rose-500/30">
            <p className="flex items-center gap-1 text-xs font-medium text-rose-300">
              <ArrowDown size={14} aria-hidden /> Sai
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold text-slate-100">
              {outPlayer?.name ?? <span className="font-normal text-slate-500">—</span>}
            </p>
          </div>
          <div className="min-w-0 rounded-xl bg-pitch-500/10 p-2 ring-1 ring-pitch-500/30">
            <p className="flex items-center gap-1 text-xs font-medium text-pitch-300">
              <ArrowUp size={14} aria-hidden /> Entra
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold text-slate-100">
              {inPlayer?.name ?? <span className="font-normal text-slate-500">—</span>}
            </p>
          </div>
        </div>

        <div className="-mx-1 grid min-h-0 flex-1 content-start gap-3 overflow-y-auto px-1">
          <section className="grid gap-1.5">
            <SectionLabel>Sai</SectionLabel>
            {team.players.map((player) => (
              <PlayerRow
                key={player.userId}
                player={player}
                selected={player.userId === outId}
                tone="out"
                disabled={busy}
                onSelect={() => setOutId(player.userId)}
                detail={player.isKeeper ? "Goleiro" : undefined}
              />
            ))}
          </section>

          <section className="grid gap-1.5">
            <SectionLabel>Entra</SectionLabel>

            {groups.left.length > 0 ? (
              <BenchGroup title="Saíram desta partida">
                {groups.left.map((player) => (
                  <PlayerRow
                    key={player.userId}
                    player={player}
                    selected={player.userId === inId}
                    tone="in"
                    disabled={busy}
                    onSelect={() => setInId(player.userId)}
                  />
                ))}
              </BenchGroup>
            ) : null}

            {groups.queue.map((group) => {
              const name = queueNames.get(group.teamId) ?? "?";
              const queuePalette = teamColor(name);
              return (
                <BenchGroup
                  key={group.teamId}
                  title={teamName(name)}
                  dot={queuePalette.dot}
                  titleClassName={queuePalette.text}
                >
                  {group.players.map((player) => (
                    <PlayerRow
                      key={player.userId}
                      player={player}
                      selected={player.userId === inId}
                      tone="in"
                      disabled={busy}
                      onSelect={() => setInId(player.userId)}
                    />
                  ))}
                </BenchGroup>
              );
            })}

            {groups.reserves.length > 0 ? (
              <BenchGroup title="Reservas">
                {groups.reserves.map((player) => (
                  <PlayerRow
                    key={player.userId}
                    player={player}
                    selected={player.userId === inId}
                    tone="in"
                    disabled={busy}
                    onSelect={() => setInId(player.userId)}
                  />
                ))}
              </BenchGroup>
            ) : null}

            {!hasBench ? (
              <p className="rounded-xl border border-dashed border-white/15 p-3 text-center text-sm text-slate-400">
                Ninguém disponível para entrar.
              </p>
            ) : null}
          </section>
        </div>

        <div className="grid shrink-0 gap-2">
          <div role="radiogroup" aria-label="Duração da troca" className="grid grid-cols-2 gap-2">
            <ModeOption
              checked={!permanent}
              disabled={busy}
              onSelect={() => setWantsPermanent(false)}
              title="Só nesta partida"
              hint="Na próxima, tudo volta ao normal"
            />
            <ModeOption
              checked={permanent}
              disabled={busy || !!blocker}
              onSelect={() => setWantsPermanent(true)}
              title="Até o fim da pelada"
              hint="Troca de elenco"
            />
          </div>
          {blocker ? <p className="text-xs text-slate-400">{blocker}</p> : null}
          {check && !check.ok ? <p className="text-xs text-rose-300">{check.error}</p> : null}

          <Button
            size="lg"
            disabled={!canConfirm}
            onClick={() => {
              if (outPlayer && inPlayer) {
                onConfirm({ outUserId: outPlayer.userId, inUserId: inPlayer.userId, permanent });
              }
            }}
          >
            Confirmar substituição
          </Button>
          <Button variant="ghost" className="touch-target" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        </div>
      </Card>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <p className="text-sm font-medium text-slate-300">{children}</p>;
}

function BenchGroup({
  title,
  dot,
  titleClassName,
  children,
}: {
  title: string;
  dot?: string;
  titleClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <p
        className={cn(
          "flex items-center gap-2 pt-1 text-xs font-semibold tracking-wide text-slate-500 uppercase",
          titleClassName,
        )}
      >
        {dot ? <span className={cn("h-2 w-2 rounded-full", dot)} /> : null}
        {title}
      </p>
      {children}
    </div>
  );
}

function PlayerRow({
  player,
  selected,
  tone,
  disabled,
  onSelect,
  detail,
}: {
  player: Pick<LivePlayer | LiveBenchPlayer, "userId" | "name" | "photoUrl">;
  selected: boolean;
  tone: "in" | "out";
  disabled: boolean;
  onSelect: () => void;
  detail?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "touch-target flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition-colors active:scale-[0.99] disabled:opacity-40",
        selected
          ? tone === "out"
            ? "bg-rose-500/15 ring-1 ring-rose-500/50"
            : "bg-pitch-500/15 ring-1 ring-pitch-500/50"
          : "bg-night-800/60 hover:bg-night-800",
      )}
    >
      <Avatar name={player.name} photoUrl={player.photoUrl} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-100">{player.name}</span>
        {detail ? <span className="block text-[11px] text-slate-500">{detail}</span> : null}
      </span>
      {selected ? (
        <Check size={18} className={tone === "out" ? "text-rose-300" : "text-pitch-300"} aria-hidden />
      ) : null}
    </button>
  );
}

function ModeOption({
  checked,
  disabled,
  onSelect,
  title,
  hint,
}: {
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "touch-target rounded-xl p-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        checked
          ? "bg-pitch-500/15 ring-1 ring-pitch-500/50"
          : "bg-night-800/60 ring-1 ring-white/10 hover:bg-night-800",
      )}
    >
      <span className="block text-sm font-semibold text-slate-100">{title}</span>
      <span className="block text-[11px] leading-tight text-slate-400">{hint}</span>
    </button>
  );
}
