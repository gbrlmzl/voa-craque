/**
 * Regras do ciclo de vida da pelada, numa fonte so para a tela e o servidor.
 * O tipo de status e proprio (nao o do Prisma) de proposito, como em
 * admin-registration.ts: o modulo e puro e nao importa o cliente do banco.
 */

export type GameDayStatusName = "OPEN" | "TEAMS_SET" | "LIVE" | "FINISHED" | "CANCELED";

/** matchStarted: alguma partida da pelada saiu de SCHEDULED. */
export type Phase = { status: GameDayStatusName; matchStarted: boolean };

/** "Iniciar pelada" so existe com os times definidos. */
export function canStart(status: GameDayStatusName): boolean {
  return status === "TEAMS_SET";
}

/**
 * Times travados: "Iniciar pelada" ja e o marco de "comecou" (refazer os times
 * com a pelada LIVE devolveria o status para TEAMS_SET e desfaria o inicio),
 * e uma partida fora de SCHEDULED tambem trava.
 */
export function teamsLocked(phase: Phase): boolean {
  return (
    phase.status === "LIVE" ||
    phase.status === "FINISHED" ||
    phase.status === "CANCELED" ||
    phase.matchStarted
  );
}

/** Pelada que nao aceita mais mudanca nenhuma: encerrada ou cancelada. */
export function isClosed(status: GameDayStatusName): boolean {
  return status === "FINISHED" || status === "CANCELED";
}

/** O painel e a tela ao vivo so existem depois de "Iniciar pelada" (e seguem existindo depois de encerrada). */
export function canWatchLive(status: GameDayStatusName): boolean {
  return status === "LIVE" || status === "FINISHED";
}
