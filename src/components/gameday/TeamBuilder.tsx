"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, Save, Shuffle } from "lucide-react";
import { PlayerChip, Stars } from "@/components/player";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, SectionTitle, Select } from "@/components/ui";
import { PAYMENT_STATUS_LABEL, teamColor } from "@/lib/labels";

const TEAM_NAMES = ["A", "B", "C", "D", "E"] as const;
const RESERVE = "RESERVA";

export type BuilderPlayer = {
  userId: string;
  name: string;
  photoUrl: string | null;
  stars: number | null;
  positionLabel: string;
  isKeeper: boolean;
  paymentStatus: "PENDING" | "CONFIRMED" | "REJECTED";
};

export type BuilderTeam = { name: string; averageStrength: number; playerIds: string[] };

export function TeamBuilder({
  gameDayId,
  teamSize,
  pool,
  teams,
  reserveIds,
  locked,
}: {
  gameDayId: string;
  teamSize: number;
  pool: BuilderPlayer[];
  teams: BuilderTeam[];
  reserveIds: string[];
  locked: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const initialAssignment = useMemo(() => {
    const map: Record<string, string> = {};
    for (const player of pool) map[player.userId] = RESERVE;
    for (const team of teams) {
      for (const playerId of team.playerIds) map[playerId] = team.name;
    }
    for (const playerId of reserveIds) map[playerId] = RESERVE;
    return map;
  }, [pool, teams, reserveIds]);

  const [assignment, setAssignment] = useState<Record<string, string>>(initialAssignment);
  const [busy, setBusy] = useState(false);

  // Depois de sortear, o servidor manda times novos. Sem isto a lista de ajuste
  // continuaria mostrando a escalacao anterior.
  const signature = useMemo(
    () => JSON.stringify([teams.map((team) => [team.name, team.playerIds]), reserveIds]),
    [teams, reserveIds],
  );
  const [lastSignature, setLastSignature] = useState(signature);
  if (lastSignature !== signature) {
    setLastSignature(signature);
    setAssignment(initialAssignment);
  }

  const maxTeams = Math.min(TEAM_NAMES.length, Math.max(2, Math.floor(pool.length / teamSize)));
  const slots = TEAM_NAMES.slice(0, Math.max(maxTeams, teams.length || 2));
  const unrated = pool.filter((player) => player.stars === null).length;
  const dirty = pool.some((player) => assignment[player.userId] !== initialAssignment[player.userId]);

  const countFor = (name: string) => pool.filter((player) => assignment[player.userId] === name).length;
  const overflow = slots.filter((name) => countFor(name) > teamSize);

  async function draw() {
    setBusy(true);
    try {
      const response = await fetch(`/api/peladas/${gameDayId}/times/sorteio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível sortear.");
      toast.show({
        message: `${body.teams.length} times sorteados. Diferença de força: ${body.spread}.`,
        tone: "success",
      });
      router.refresh();
    } catch (error) {
      toast.show({ message: (error as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const payload = {
        teams: slots.map((name) => ({
          name,
          playerIds: pool
            .filter((player) => assignment[player.userId] === name)
            .map((player) => player.userId),
        })),
        reserveIds: pool
          .filter((player) => assignment[player.userId] === RESERVE)
          .map((player) => player.userId),
      };

      const response = await fetch(`/api/peladas/${gameDayId}/times`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível salvar os times.");
      toast.show({ message: "Times salvos.", tone: "success" });
      router.refresh();
    } catch (error) {
      toast.show({ message: (error as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (locked) {
    return (
      <Card>
        <p className="text-sm text-slate-300">
          A pelada já começou. Os times ficam como estão até o fim do dia.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-5">
      <Card className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold">{pool.length} jogadores inscritos</p>
            <p className="text-xs text-slate-500">
              Dá {Math.floor(pool.length / teamSize)} times de {teamSize}
              {pool.length % teamSize > 0 ? ` e ${pool.length % teamSize} na reserva` : ""}.
            </p>
          </div>
          {teams.length > 0 ? <Badge tone="good">{teams.length} times montados</Badge> : null}
        </div>

        {unrated > 0 ? (
          <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {unrated} {unrated === 1 ? "jogador entra" : "jogadores entram"} sem avaliação. O sorteio usa a
            mediana do grupo para eles.
          </p>
        ) : null}

        <Button size="lg" onClick={draw} disabled={busy || pool.length < teamSize * 2}>
          <Shuffle size={18} /> {teams.length > 0 ? "Sortear de novo" : "Sortear times"}
        </Button>

        {pool.length < teamSize * 2 ? (
          <p className="text-xs text-slate-500">
            São necessários {teamSize * 2} inscritos para formar dois times.
          </p>
        ) : null}
      </Card>

      {teams.length > 0 ? (
        <section>
          <SectionTitle hint="média de força">Resultado do sorteio</SectionTitle>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {teams.map((team) => {
              const palette = teamColor(team.name);
              return (
                <div key={team.name} className={`rounded-xl border p-3 ${palette.border}`}>
                  <p className={`text-sm font-semibold ${palette.text}`}>Time {team.name}</p>
                  <p className="text-2xl font-bold">{team.averageStrength}</p>
                  <p className="text-xs text-slate-500">{team.playerIds.length} jogadores</p>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section>
        <SectionTitle hint="ajuste na mão">Escalação</SectionTitle>

        <div className="mb-2 flex flex-wrap gap-1.5">
          {slots.map((name) => {
            const count = countFor(name);
            const palette = teamColor(name);
            return (
              <Badge key={name} tone={count > teamSize ? "bad" : "neutral"} className={palette.text}>
                {name}: {count}/{teamSize}
              </Badge>
            );
          })}
          <Badge>Reserva: {countFor(RESERVE)}</Badge>
        </div>

        <Card className="grid gap-1 p-2">
          {pool.map((player) => (
            <div key={player.userId} className="flex items-center gap-2 rounded-xl px-1 py-1">
              <PlayerChip
                userId={player.userId}
                name={player.name}
                photoUrl={player.photoUrl}
                subtitle={
                  <span className="flex items-center gap-1.5">
                    {player.positionLabel}
                    <Stars value={player.stars} size={10} />
                  </span>
                }
                className="min-w-0 flex-1"
              />

              {player.paymentStatus !== "CONFIRMED" ? (
                <Badge tone="warn" className="hidden sm:inline-flex">
                  {PAYMENT_STATUS_LABEL[player.paymentStatus]}
                </Badge>
              ) : null}

              <Select
                value={assignment[player.userId] ?? RESERVE}
                onChange={(event) =>
                  setAssignment((current) => ({ ...current, [player.userId]: event.target.value }))
                }
                className="h-11 w-28 shrink-0"
                aria-label={`Time de ${player.name}`}
              >
                {slots.map((name) => (
                  <option key={name} value={name}>
                    Time {name}
                  </option>
                ))}
                <option value={RESERVE}>Reserva</option>
              </Select>
            </div>
          ))}
        </Card>

        {overflow.length > 0 ? (
          <p className="mt-2 text-sm text-rose-300">
            {overflow.map((name) => `Time ${name}`).join(", ")} passou de {teamSize} jogadores.
          </p>
        ) : null}

        <Button
          size="lg"
          variant="secondary"
          className="mt-3 w-full"
          onClick={save}
          disabled={busy || overflow.length > 0 || !dirty}
        >
          <Save size={18} /> Salvar escalação
        </Button>
      </section>
    </div>
  );
}
