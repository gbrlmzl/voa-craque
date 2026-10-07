/**
 * Atalho flutuante para a pelada ao vivo: o que o endpoint /api/game-days/live-now
 * devolve e as regras de quando mostrar. Modulo puro, no mesmo estilo de
 * match-engine.ts, para o hook ficar so com busca e estado.
 */

export type LiveNowMatch = {
  id: string;
  orderIndex: number;
  status: "SCHEDULED" | "RUNNING" | "PAUSED";
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
};

export type LiveNow = {
  gameDayId: string;
  title: string;
  /** Partida em aberto mais antiga; null quando nao ha nenhuma montada. */
  match: LiveNowMatch | null;
};

/** Chave em sessionStorage de quem fechou o atalho. */
export const LIVE_BANNER_DISMISSED_KEY = "vc_live_banner_dismissed";

/** Intervalo: ainda nao ha partida rolando (a proxima esta pronta, ou nao ha proxima). */
export function isInterval(live: LiveNow): boolean {
  return !live.match || live.match.status === "SCHEDULED";
}

/**
 * Identifica o que foi dispensado: a pelada e a partida em aberto. Quando a
 * partida seguinte nasce o valor muda e o atalho volta.
 */
export function dismissKey(live: LiveNow): string {
  return `${live.gameDayId}:${live.match?.id ?? "intervalo"}`;
}

/** Dentro do proprio painel o atalho nao faz sentido; fechado, so volta com a partida seguinte. */
export function shouldShowLiveNow(live: LiveNow | null, pathname: string, dismissed: string | null): boolean {
  if (!live) return false;
  if (pathname === `/game-days/${live.gameDayId}/panel`) return false;
  return dismissed !== dismissKey(live);
}
