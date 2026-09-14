/**
 * Maquina de estados da partida e rotacao da fila de times.
 *
 * Modulo puro: recebe estado, devolve estado novo. Nao toca no banco nem no
 * relogio do sistema (o "agora" sempre entra por parametro), para que o
 * comportamento seja reproduzivel nos testes.
 */

export type MatchStatus = "SCHEDULED" | "RUNNING" | "PAUSED" | "FINISHED";
export type MatchResult = "HOME" | "AWAY" | "DRAW";
export type MatchEndReason = "GOALS" | "TIME" | "MANUAL";
export type Side = "HOME" | "AWAY";

export type MatchClock = {
  status: MatchStatus;
  durationMs: number;
  /** Tempo congelado no ultimo pause/stop. */
  remainingMs: number;
  /** Epoch em ms do ultimo start/resume. null quando o relogio nao corre. */
  lastResumedAt: number | null;
};

export type ScoreState = { home: number; away: number };

export type Outcome = {
  finished: boolean;
  result: MatchResult | null;
  reason: MatchEndReason | null;
};

export class MatchStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatchStateError";
  }
}

export function createClock(durationMs: number): MatchClock {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new MatchStateError("Duração da partida inválida.");
  }
  return { status: "SCHEDULED", durationMs, remainingMs: durationMs, lastResumedAt: null };
}

/** Tempo restante em ms considerando o cronometro correndo. */
export function remainingAt(clock: MatchClock, now: number): number {
  if (clock.status !== "RUNNING" || clock.lastResumedAt === null) {
    return Math.max(0, clock.remainingMs);
  }
  return Math.max(0, clock.remainingMs - (now - clock.lastResumedAt));
}

export function elapsedAt(clock: MatchClock, now: number): number {
  return Math.max(0, clock.durationMs - remainingAt(clock, now));
}

export function startClock(clock: MatchClock, now: number): MatchClock {
  if (clock.status !== "SCHEDULED") {
    throw new MatchStateError("Só é possível iniciar uma partida que ainda não começou.");
  }
  return { ...clock, status: "RUNNING", lastResumedAt: now };
}

export function pauseClock(clock: MatchClock, now: number): MatchClock {
  if (clock.status !== "RUNNING") {
    throw new MatchStateError("Só é possível pausar uma partida em andamento.");
  }
  return { ...clock, status: "PAUSED", remainingMs: remainingAt(clock, now), lastResumedAt: null };
}

export function resumeClock(clock: MatchClock, now: number): MatchClock {
  if (clock.status !== "PAUSED") {
    throw new MatchStateError("Só é possível retomar uma partida pausada.");
  }
  if (clock.remainingMs <= 0) {
    throw new MatchStateError("O tempo da partida já acabou.");
  }
  return { ...clock, status: "RUNNING", lastResumedAt: now };
}

export function stopClock(clock: MatchClock, now: number): MatchClock {
  if (clock.status === "FINISHED") {
    throw new MatchStateError("A partida já foi encerrada.");
  }
  return { ...clock, status: "FINISHED", remainingMs: remainingAt(clock, now), lastResumedAt: null };
}

export function applyGoal(score: ScoreState, side: Side): ScoreState {
  return side === "HOME" ? { ...score, home: score.home + 1 } : { ...score, away: score.away + 1 };
}

export function revertGoal(score: ScoreState, side: Side): ScoreState {
  if (side === "HOME") return { ...score, home: Math.max(0, score.home - 1) };
  return { ...score, away: Math.max(0, score.away - 1) };
}

function resultFromScore(score: ScoreState): MatchResult {
  if (score.home > score.away) return "HOME";
  if (score.away > score.home) return "AWAY";
  return "DRAW";
}

/**
 * A partida acaba por gols ou pelo fim do cronometro, o que vier primeiro.
 * Empate no fim do tempo e um desfecho valido: os dois times saem.
 */
export function evaluateOutcome(params: {
  score: ScoreState;
  clock: MatchClock;
  now: number;
  goalsToWin: number;
}): Outcome {
  const { score, clock, now, goalsToWin } = params;

  if (clock.status === "FINISHED") {
    return { finished: true, result: resultFromScore(score), reason: null };
  }

  if (goalsToWin > 0) {
    if (score.home >= goalsToWin && score.home > score.away) {
      return { finished: true, result: "HOME", reason: "GOALS" };
    }
    if (score.away >= goalsToWin && score.away > score.home) {
      return { finished: true, result: "AWAY", reason: "GOALS" };
    }
  }

  if (clock.status !== "SCHEDULED" && remainingAt(clock, now) <= 0) {
    return { finished: true, result: resultFromScore(score), reason: "TIME" };
  }

  return { finished: false, result: null, reason: null };
}

export type QueueRotation = {
  /** Times que continuam esperando, ja na ordem. */
  queue: string[];
  nextHomeTeamId: string | null;
  nextAwayTeamId: string | null;
  /** Quem saiu de quadra nesta rodada. */
  leaving: string[];
  /** Quem ficou em quadra. null no empate. */
  staying: string | null;
};

/**
 * Quem vence fica. Quem perde vai para o fim da fila e entra o proximo.
 * No empate os dois saem e entram as duas proximas equipes.
 */
export function rotateQueue(params: {
  homeTeamId: string;
  awayTeamId: string;
  result: MatchResult;
  queue: string[];
}): QueueRotation {
  const { homeTeamId, awayTeamId, result, queue } = params;
  const waiting = queue.filter((id) => id !== homeTeamId && id !== awayTeamId);

  if (result === "DRAW") {
    const next = [...waiting, homeTeamId, awayTeamId];
    const nextHome = next.shift() ?? null;
    const nextAway = next.shift() ?? null;
    return {
      queue: next,
      nextHomeTeamId: nextHome,
      nextAwayTeamId: nextAway,
      leaving: [homeTeamId, awayTeamId],
      staying: null,
    };
  }

  const winner = result === "HOME" ? homeTeamId : awayTeamId;
  const loser = result === "HOME" ? awayTeamId : homeTeamId;
  const next = [...waiting, loser];
  const challenger = next.shift() ?? null;

  return {
    queue: next,
    nextHomeTeamId: winner,
    nextAwayTeamId: challenger,
    leaving: [loser],
    staying: winner,
  };
}

export function formatClock(ms: number): string {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
