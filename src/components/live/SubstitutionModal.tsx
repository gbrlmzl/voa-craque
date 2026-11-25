"use client";

import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Avatar } from "@/components/Player";
import { Button, Card, cn } from "@/components/ui";
import { teamColor } from "@/lib/labels";
import { useTeamName } from "@/components/providers/PreferencesProvider";
import {
  evaluateSubstitutionBatch,
  groupBench,
  permanentBlocker,
  type SubstitutionSwap,
  type SubstitutionView,
} from "@/lib/substitution";
import type { LiveBenchPlayer, LiveMatch, LivePlayer, LiveTeam } from "@/services/live";

export type SubstitutionSelection = { swaps: SubstitutionSwap[]; permanent: boolean };

const countLabel = (count: number) => `${count} ${count === 1 ? "jogador" : "jogadores"}`;
const toggle = (ids: string[], id: string) =>
  ids.includes(id) ? ids.filter((current) => current !== id) : [...ids, id];

/**
 * Placa de substituicao do futebol: quem sai em cima, quem entra embaixo. Nao
 * pausa a partida (a troca no futsal e volante). Da para trocar mais de um
 * jogador de uma vez: quem sai e quem entra formam pares na ordem em que foram
 * escolhidos (o 1o que sai com o 1o que entra) e so da para confirmar quando
 * cada um que sai tem alguem entrando. Tocar de novo num escolhido desmarca. As
 * regras vem de lib/substitution.ts, as mesmas que o servidor aplica, entao o
 * modal nunca oferece uma troca que seria recusada.
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
  const [outIds, setOutIds] = useState<string[]>([]);
  const [inIds, setInIds] = useState<string[]>([]);
  const [wantsPermanent, setWantsPermanent] = useState(false);

  const groups = groupBench(match.bench, team.id, queue.map((entry) => entry.id));
  const queueNames = new Map(queue.map((entry) => [entry.id, entry.name]));

  // A selecao so vale enquanto o jogador continua na lista: a partida muda ao vivo.
  const outPlayers = outIds.flatMap((id) => team.players.find((player) => player.userId === id) ?? []);
  const inPlayers = inIds.flatMap((id) => match.bench.find((player) => player.userId === id) ?? []);
  const pairs = outPlayers
    .slice(0, inPlayers.length)
    .map((outPlayer, index) => ({ outPlayer, inPlayer: inPlayers[index] }));
  const missing = outPlayers.length - inPlayers.length;
  // O numero mostra quem troca com quem; so faz falta com mais de um jogador de algum lado.
  const numbered = Math.max(outPlayers.length, inPlayers.length) > 1;

  const view: SubstitutionView = {
    homeTeamId: match.home.id,
    awayTeamId: match.away.id,
    court: [match.home, match.away].flatMap((side) =>
      side.players.map((player) => ({ userId: player.userId, teamId: side.id })),
    ),
    bench: match.bench,
    rosters: { [match.home.id]: match.home.roster, [match.away.id]: match.away.roster },
  };

  // Uma escolha so para o lote: a troca de elenco so vale se todos os pares puderem.
  const blocked = pairs
    .map(({ outPlayer, inPlayer }) => ({
      outPlayer,
      inPlayer,
      reason: permanentBlocker({
        teamId: team.id,
        teamRoster: team.roster,
        outUserId: outPlayer.userId,
        inPlayer,
      }),
    }))
    .find((pair) => pair.reason);
  const blocker = blocked
    ? pairs.length > 1
      ? `${blocked.outPlayer.name} por ${blocked.inPlayer.name}: ${blocked.reason}`
      : blocked.reason
    : null;
  const permanent = wantsPermanent && !blocker;

  const swaps: SubstitutionSwap[] = pairs.map(({ outPlayer, inPlayer }) => ({
    outUserId: outPlayer.userId,
    inUserId: inPlayer.userId,
  }));
  const check =
    swaps.length > 0 && missing === 0
      ? evaluateSubstitutionBatch(view, { teamId: team.id, swaps, permanent })
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
          <SummaryCard
            tone="out"
            title="Sai"
            icon={<ArrowDown size={14} aria-hidden />}
            players={outPlayers}
            numbered={numbered}
          />
          <SummaryCard
            tone="in"
            title="Entra"
            icon={<ArrowUp size={14} aria-hidden />}
            players={inPlayers}
            numbered={numbered}
          />
        </div>

        <div className="-mx-1 grid min-h-0 flex-1 content-start gap-3 overflow-y-auto px-1">
          <section className="grid gap-1.5">
            <SectionLabel>Sai</SectionLabel>
            {team.players.map((player) => (
              <PlayerRow
                key={player.userId}
                player={player}
                order={orderOf(outPlayers, player.userId)}
                tone="out"
                disabled={busy}
                onSelect={() => setOutIds((ids) => toggle(ids, player.userId))}
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
                    order={orderOf(inPlayers, player.userId)}
                    tone="in"
                    disabled={busy}
                    onSelect={() => setInIds((ids) => toggle(ids, player.userId))}
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
                      order={orderOf(inPlayers, player.userId)}
                      tone="in"
                      disabled={busy}
                      onSelect={() => setInIds((ids) => toggle(ids, player.userId))}
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
                    order={orderOf(inPlayers, player.userId)}
                    tone="in"
                    disabled={busy}
                    onSelect={() => setInIds((ids) => toggle(ids, player.userId))}
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
              title="Temporária"
              //hint="Na próxima partida, o time volta a ser o mesmo"
            />
            <ModeOption
              checked={permanent}
              disabled={busy || !!blocker}
              onSelect={() => setWantsPermanent(true)}
              title="Até o fim da pelada"
              //hint="Troca de elenco"
            />
          </div>
          {blocker ? <p className="text-xs text-slate-400">{blocker}</p> : null}
          {missing !== 0 ? (
            <p className="text-xs text-slate-400">
              {missing > 0
                ? `Escolha mais ${countLabel(missing)} para entrar.`
                : `Escolha mais ${countLabel(-missing)} para sair.`}
            </p>
          ) : null}
          {check && !check.ok ? <p className="text-xs text-rose-300">{check.error}</p> : null}

          <Button
            size="lg"
            disabled={!canConfirm}
            onClick={() => {
              if (check?.ok) onConfirm({ swaps, permanent });
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

/** Posicao (a partir de 1) na ordem em que o jogador foi escolhido; null se nao foi. */
function orderOf(selected: { userId: string }[], userId: string): number | null {
  const index = selected.findIndex((player) => player.userId === userId);
  return index < 0 ? null : index + 1;
}

const TONE = {
  out: { text: "text-rose-300", badge: "bg-rose-300", row: "bg-rose-500/15 ring-1 ring-rose-500/50" },
  in: { text: "text-pitch-300", badge: "bg-pitch-300", row: "bg-pitch-500/15 ring-1 ring-pitch-500/50" },
} as const;

/** Numero do par: o 1 que sai troca com o 1 que entra. */
function OrderBadge({ tone, order }: { tone: "in" | "out"; order: number }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full px-1 text-[11px] leading-none font-bold text-night-900",
        TONE[tone].badge,
      )}
    >
      {order}
    </span>
  );
}

function SummaryCard({
  tone,
  title,
  icon,
  players,
  numbered,
}: {
  tone: "in" | "out";
  title: string;
  icon: ReactNode;
  players: { userId: string; name: string }[];
  numbered: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl p-2 ring-1",
        tone === "out" ? "bg-rose-500/10 ring-rose-500/30" : "bg-pitch-500/10 ring-pitch-500/30",
      )}
    >
      <p className={cn("flex items-center gap-1 text-xs font-medium", TONE[tone].text)}>
        {icon} {title}
      </p>
      {players.length === 0 ? (
        <p className="mt-0.5 truncate text-sm font-normal text-slate-500">—</p>
      ) : (
        <ol className="mt-0.5 grid gap-0.5">
          {players.map((player, index) => (
            <li key={player.userId} className="flex min-w-0 items-center gap-1.5">
              {numbered ? <OrderBadge tone={tone} order={index + 1} /> : null}
              <span className="truncate text-sm font-semibold text-slate-100">{player.name}</span>
            </li>
          ))}
        </ol>
      )}
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
  order,
  tone,
  disabled,
  onSelect,
  detail,
}: {
  player: Pick<LivePlayer | LiveBenchPlayer, "userId" | "name" | "photoUrl">;
  /** Posicao na escolha (1, 2, 3...), ou null quando o jogador nao esta escolhido. */
  order: number | null;
  tone: "in" | "out";
  disabled: boolean;
  onSelect: () => void;
  detail?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={order !== null}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "touch-target flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition-colors active:scale-[0.99] disabled:opacity-40",
        order !== null ? TONE[tone].row : "bg-night-800/60 hover:bg-night-800",
      )}
    >
      <Avatar name={player.name} photoUrl={player.photoUrl} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-100">{player.name}</span>
        {detail ? <span className="block text-[11px] text-slate-500">{detail}</span> : null}
      </span>
      {order !== null ? <OrderBadge tone={tone} order={order} /> : null}
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
  hint?: string;
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
      <span className="block text-center text-sm font-semibold text-slate-100">{title}</span>
      <span className="block text-center text-[11px] leading-tight text-slate-400">{hint}</span>
    </button>
  );
}
