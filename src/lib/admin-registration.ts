export type GameDayPhase = "OPEN" | "TEAMS_SET" | "LIVE" | "FINISHED";

export type AdminRegistrationCheck =
  | { ok: true; asReserve: boolean }
  | { ok: false; error: string };

export function remainingSlots(registeredCount: number, maxPlayers: number): number {
  return Math.max(0, maxPlayers - registeredCount);
}

export function checkAdminRegistration(input: {
  status: GameDayPhase;
  matchStarted: boolean;
  registeredCount: number;
  maxPlayers: number;
  selectedCount: number;
}): AdminRegistrationCheck {
  if (input.selectedCount < 1) return { ok: false, error: "Escolha pelo menos um jogador." };
  if (input.status === "FINISHED") return { ok: false, error: "Esta pelada já foi encerrada." };

  if (input.registeredCount + input.selectedCount > input.maxPlayers) {
    const remaining = remainingSlots(input.registeredCount, input.maxPlayers);
    if (remaining === 0) {
      return {
        ok: false,
        error: `A pelada está lotada (${input.registeredCount}/${input.maxPlayers}). Aumente o limite em "Editar pelada" para inscrever mais gente.`,
      };
    }
    const noun = remaining === 1 ? "jogador" : "jogadores";
    return {
      ok: false,
      error: `Só cabe${remaining === 1 ? "" : "m"} mais ${remaining} ${noun}. Aumente o limite em "Editar pelada" ou escolha menos gente.`,
    };
  }

  return { ok: true, asReserve: input.status !== "OPEN" };
}

export type RemovalCheck = { ok: true } | { ok: false; error: string };

export function checkAdminRemoval(input: {
  status: GameDayPhase;
  playerName: string;
  inTeam: boolean;
  hasPlayed: boolean;
}): RemovalCheck {
  if (input.status === "FINISHED") return { ok: false, error: "Esta pelada já foi encerrada." };
  if (input.hasPlayed) {
    return {
      ok: false,
      error: `${input.playerName} já jogou nesta pelada. A inscrição não pode mais ser removida.`,
    };
  }
  if (input.inTeam) {
    return {
      ok: false,
      error: `${input.playerName} está num time. Tire ele do time em "Refazer times" antes de remover.`,
    };
  }
  return { ok: true };
}
