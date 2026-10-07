/**
 * Retrospecto de um time na pelada: partidas, vitorias, empates, derrotas e o
 * historico contra cada adversario.
 *
 * Modulo puro, no mesmo estilo de match-engine.ts. A tabela "Como estao os
 * times" (services/live.ts) e o modal do time usam esta funcao, entao os dois
 * nunca divergem.
 */

export type FinishedMatchRow = {
  id: string;
  orderIndex: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  result: "HOME" | "AWAY" | "DRAW" | null;
};

export type TeamRecord = {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
};

export type TeamHistoryEntry = {
  matchId: string;
  orderIndex: number;
  opponentTeamId: string;
  goalsFor: number;
  goalsAgainst: number;
  outcome: "WIN" | "DRAW" | "LOSS";
};

/** Considera so as partidas em que o time jogou; `result` nulo conta como empate. */
export function summarizeTeam(
  teamId: string,
  matches: FinishedMatchRow[],
): { record: TeamRecord; history: TeamHistoryEntry[] } {
  const record: TeamRecord = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
  const history: TeamHistoryEntry[] = [];

  const played = matches
    .filter((match) => match.homeTeamId === teamId || match.awayTeamId === teamId)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  for (const match of played) {
    const isHome = match.homeTeamId === teamId;
    const goalsFor = isHome ? match.homeScore : match.awayScore;
    const goalsAgainst = isHome ? match.awayScore : match.homeScore;
    const wonSide = isHome ? "HOME" : "AWAY";
    const lostSide = isHome ? "AWAY" : "HOME";
    const outcome = match.result === wonSide ? "WIN" : match.result === lostSide ? "LOSS" : "DRAW";

    record.played += 1;
    record.goalsFor += goalsFor;
    record.goalsAgainst += goalsAgainst;
    if (outcome === "WIN") record.won += 1;
    else if (outcome === "LOSS") record.lost += 1;
    else record.drawn += 1;

    history.push({
      matchId: match.id,
      orderIndex: match.orderIndex,
      opponentTeamId: isHome ? match.awayTeamId : match.homeTeamId,
      goalsFor,
      goalsAgainst,
      outcome,
    });
  }

  return { record, history };
}
