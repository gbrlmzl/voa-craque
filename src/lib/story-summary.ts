import { formatPercent } from "@/lib/labels";

/** O que o cartao do story mostra, sem canvas: regras puras e testaveis. */

export type StoryHeadline = { value: string; label: string; secondary: string | null };
export type StoryBadge = "MVP" | "TOP_SCORER" | "UNBEATEN";

const MAX_BADGES = 2;

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/**
 * O melhor numero de cada um: gols se fez pelo menos 1; senao vitorias; senao
 * partidas jogadas. O aproveitamento vira linha secundaria quando houve vitoria
 * (quem nao venceu nenhuma nao quer postar "0%" gigante).
 */
export function pickHeadline(stats: {
  played: number;
  won: number;
  goals: number;
  winRate: number;
}): StoryHeadline {
  const secondary = stats.won > 0 ? `${formatPercent(stats.winRate)} de aproveitamento` : null;

  if (stats.goals >= 1) {
    return {
      value: String(stats.goals),
      label: plural(stats.goals, "GOL NA PELADA", "GOLS NA PELADA"),
      secondary,
    };
  }
  if (stats.won >= 1) {
    return { value: String(stats.won), label: plural(stats.won, "VITÓRIA", "VITÓRIAS"), secondary };
  }
  return {
    value: String(stats.played),
    label: plural(stats.played, "PARTIDA JOGADA", "PARTIDAS JOGADAS"),
    secondary,
  };
}

/** Na ordem MVP, Artilheiro, Invicto (jogou 2 ou mais sem perder); no maximo 2. */
export function pickBadges(stats: {
  played: number;
  lost: number;
  mvp: boolean;
  topScorer: boolean;
}): StoryBadge[] {
  const badges: StoryBadge[] = [];
  if (stats.mvp) badges.push("MVP");
  if (stats.topScorer) badges.push("TOP_SCORER");
  if (stats.played >= 2 && stats.lost === 0) badges.push("UNBEATEN");
  return badges.slice(0, MAX_BADGES);
}
