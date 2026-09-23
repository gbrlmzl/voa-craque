"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";

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

export function useTeamBuilder({
  gameDayId,
  teamSize,
  pool,
  teams,
  reserveIds,
}: {
  gameDayId: string;
  teamSize: number;
  pool: BuilderPlayer[];
  teams: BuilderTeam[];
  reserveIds: string[];
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

  // Depois de sortear, o servidor manda times novos: resincroniza a escalacao
  // sempre que o conjunto de times/reservas mudar de verdade.
  const signature = useMemo(
    () => JSON.stringify([teams.map((team) => [team.name, team.playerIds]), reserveIds]),
    [teams, reserveIds],
  );
  useEffect(() => {
    setAssignment(initialAssignment);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const maxTeams = Math.min(TEAM_NAMES.length, Math.max(2, Math.floor(pool.length / teamSize)));
  const slots = TEAM_NAMES.slice(0, Math.max(maxTeams, teams.length || 2));
  const unrated = pool.filter((player) => player.stars === null).length;
  const dirty = pool.some((player) => assignment[player.userId] !== initialAssignment[player.userId]);

  const countFor = (name: string) => pool.filter((player) => assignment[player.userId] === name).length;
  const overflow = slots.filter((name) => countFor(name) > teamSize);

  function assign(userId: string, teamName: string) {
    setAssignment((current) => ({ ...current, [userId]: teamName }));
  }

  async function draw() {
    setBusy(true);
    try {
      const response = await fetch(`/api/game-days/${gameDayId}/teams/draw`, {
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

      const response = await fetch(`/api/game-days/${gameDayId}/teams`, {
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

  return {
    assignment,
    assign,
    busy,
    slots,
    unrated,
    dirty,
    countFor,
    overflow,
    draw,
    save,
    RESERVE,
  };
}
