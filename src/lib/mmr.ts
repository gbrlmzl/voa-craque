/**
 * MMR (Match Making Rating) dos jogadores.
 *
 * Modulo puro: nao importa Prisma, React nem nada do Next. Recebe o estado dos
 * jogadores antes da pelada e as partidas encerradas, devolve o movimento de
 * cada um. Testado em tests/mmr.test.ts; a especificacao completa esta em
 * docs/plano-mmr-e-ranking.md (secoes 0 e 2).
 *
 * O MMR e so o placar do ranking geral: nao vira estrela, nao entra no sorteio.
 * Mede o quanto o jogador rendeu acima ou abaixo do esperado, e o esperado sai 75%
 * da estrela do perfil e 25% do proprio MMR. Cada partida soma tres blocos
 * (resultado, ataque, defesa), o total da pelada e normalizado para soma zero e so
 * entao recebe o fator de aposta (que tambem sai da estrela), a calibracao e o
 * teto. Todo mundo vale igual, qualquer que seja a posicao em quadra.
 */

export const MMR = {
  BASE: 1000, // centro da escala e MMR de quem nunca jogou: a estrela nao mexe no numero inicial
  MIN: 600, // piso e teto sao travas de seguranca, na pratica ninguem chega perto
  MAX: 1600,

  ELO_SCALE: 200, // os 400 do xadrez achatariam tudo: o sorteio deixa os times a poucos pontos
  K_RESULT: 10,
  K_ATTACK: 4,
  K_DEFENSE: 5,

  GOAL_POINTS: 1.0,
  ASSIST_POINTS: 0.6, // assistencia vale 60% de um gol
  ATTACK_EXPECTED_SHARE: 0.75, // margem: sem ela uma assistencia daria saldo negativo

  // O esperado de cada jogador (D18 = D): a estrela do perfil, que e a avaliacao do
  // organizador, pesa tres vezes o que o MMR pesa. A estrela so vira pontos neste
  // sentido (estrela -> escala do MMR); o caminho de volta nao existe.
  EXPECTED_STARS_WEIGHT: 0.75,
  EXPECTED_MMR_WEIGHT: 0.25,
  EXPECTED_STAR_POINTS: 100, // cada estrela acima ou abaixo de 3 vale 100 pontos
  EXPECTED_NEUTRAL_STARS: 3, // sem estrela vale 3, o centro, o mesmo ritmo neutro do fator de aposta

  QUOTA_SCALE: 300, // 300 pontos acima do centro dobrariam a cota de ataque
  QUOTA_RANGE: 200, // a cota para de crescer (e de cair) 200 pontos longe do centro

  MATCH_ATTACK_CAP: 10, // protege de goalsToWin alto e de dado estranho
  MATCH_DEFENSE_CAP: 7.5,

  STAKE_MIN: 0.7,
  STAKE_MAX: 1.3,
  STAKE_PER_STAR: 0.15, // 0,70 em 1 estrela e 1,30 em 5
  STAKE_UNRATED: 1.0, // sem estrela anda no ritmo neutro, igual a 3 estrelas

  // Sem calibracao (D4 = B): todo mundo vale o mesmo desde a primeira pelada. Para
  // voltar a calibrar, troque por faixas, ex.: { upToGameDays: 2, factor: 2.0 }.
  CALIBRATION: [{ upToGameDays: Infinity, factor: 1.0 }],

  GAMEDAY_CAP: 60, // uma noite nao decide um ranking
  GAMEDAY_CAP_CALIBRATING: 120, // so vale quando a calibracao multiplica (factor > 1)

  MIN_MATCHES_TO_RATE: 1, // D13 = B: toda pelada com partida encerrada conta
  MIN_TEAMS_TO_RATE: 2,
} as const;

export type MmrPlayer = {
  userId: string;
  /** MMR de ANTES da pelada. */
  mmr: number;
  /** Estrela do perfil que vale para esta pelada (D17); null = sem estrela. */
  stars: number | null;
  gameDaysRated: number;
};

export type MmrMatch = {
  matchId: string;
  orderIndex: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  result: "HOME" | "AWAY" | "DRAW" | null;
  /** MatchPlayer: quem jogou, por qual time. */
  lineup: { userId: string; teamId: string }[];
  /** MatchEvent da partida. */
  events: { userId: string; teamId: string; type: "GOAL" | "ASSIST" }[];
};

export type MmrMatchBreakdown = {
  matchId: string;
  orderIndex: number;
  opponentTeamId: string;
  /** Esperado medio de quem estava em quadra (ver `expectedRating`), do time e do adversario. */
  teamRating: number;
  opponentRating: number;
  expected: number;
  outcome: "WIN" | "DRAW" | "LOSS";
  goals: number;
  assists: number;
  conceded: number;
  resultDelta: number;
  attackDelta: number;
  defenseDelta: number;
};

export type MmrPlayerResult = {
  userId: string;
  mmrBefore: number;
  mmrAfter: number;
  delta: number;
  resultDelta: number;
  attackDelta: number;
  defenseDelta: number;
  normalizeDelta: number;
  stakeFactor: number;
  calibrationFactor: number;
  capped: boolean;
  /** Estrela que entrou no fator de aposta; nula se o jogador nao tinha estrela. */
  starsUsed: number | null;
  matches: number;
  goals: number;
  assists: number;
  won: number;
  drawn: number;
  lost: number;
  conceded: number;
  cleanSheets: number;
  perMatch: MmrMatchBreakdown[];
};

export type MmrGameDayResult = {
  /** Vazio quando a pelada nao conta (ver `skipped`). */
  players: MmrPlayerResult[];
  concededAverage: number;
  mvpUserId: string | null;
  /** Motivo de a pelada nao contar, ou null. */
  skipped: string | null;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * O que se espera do jogador, na escala do MMR: 75% a estrela do perfil (3 estrelas
 * = 1000, cada estrela = 100 pontos) e 25% o MMR dele. Sem estrela vale 3.
 */
export function expectedRating(stars: number | null, mmr: number): number {
  const starsRating =
    MMR.BASE + ((stars ?? MMR.EXPECTED_NEUTRAL_STARS) - MMR.EXPECTED_NEUTRAL_STARS) * MMR.EXPECTED_STAR_POINTS;
  return MMR.EXPECTED_STARS_WEIGHT * starsRating + MMR.EXPECTED_MMR_WEIGHT * mmr;
}

/** Peso do jogador na cota de ataque: 1 no centro, de 1/3 a 5/3 conforme o esperado dele. */
export function quotaLevel(rating: number): number {
  const offset = clamp(rating - MMR.BASE, -MMR.QUOTA_RANGE, MMR.QUOTA_RANGE);
  return 1 + offset / MMR.QUOTA_SCALE;
}

/** Quem tem mais estrelas arrisca mais: 0,70 em 1 estrela ate 1,30 em 5. Sem estrela, 1,00. */
export function stakeFactor(stars: number | null): number {
  if (stars === null) return MMR.STAKE_UNRATED;
  const factor = MMR.STAKE_MIN + MMR.STAKE_PER_STAR * (stars - 1);
  return Math.round(clamp(factor, MMR.STAKE_MIN, MMR.STAKE_MAX) * 10000) / 10000;
}

/** Multiplicador das primeiras peladas, pela contagem de peladas ja contadas. */
export function calibrationFactor(gameDaysRated: number): number {
  const step = MMR.CALIBRATION.find((entry) => gameDaysRated <= entry.upToGameDays);
  return step ? step.factor : 1;
}

/**
 * Desempenho da noite antes do fator de aposta, o que decide o MVP (D25): com o
 * fator vindo da estrela, o movimento final favoreceria quem tem mais estrelas.
 */
export function nightPerformance(change: {
  resultDelta: number;
  attackDelta: number;
  defenseDelta: number;
  normalizeDelta: number;
}): number {
  return round2(change.resultDelta + change.attackDelta + change.defenseDelta + change.normalizeDelta);
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

type MatchSide = { teamId: string; userIds: string[] };

/** Escalacao de cada lado; quem aparece nos dois times fica no mandante (igual a migration match_lineups). */
function matchSides(match: MmrMatch): { home: MatchSide; away: MatchSide } {
  const home = new Set<string>();
  const away = new Set<string>();
  for (const row of match.lineup) {
    if (row.teamId === match.homeTeamId) home.add(row.userId);
  }
  for (const row of match.lineup) {
    if (row.teamId === match.awayTeamId && !home.has(row.userId)) away.add(row.userId);
  }
  return {
    home: { teamId: match.homeTeamId, userIds: [...home] },
    away: { teamId: match.awayTeamId, userIds: [...away] },
  };
}

type Accumulator = {
  player: MmrPlayer;
  matches: number;
  goals: number;
  assists: number;
  won: number;
  drawn: number;
  lost: number;
  conceded: number;
  cleanSheets: number;
  resultDelta: number;
  attackDelta: number;
  defenseDelta: number;
  perMatch: MmrMatchBreakdown[];
};

/**
 * Calcula o movimento de MMR de cada jogador numa pelada.
 *
 * A ordem das etapas e normativa (ver a secao 2.4 do plano): blocos por partida,
 * soma por jogador, normalizacao para soma zero, fator de aposta, calibracao,
 * teto da pelada, piso e teto do MMR. Trocar a ordem muda o resultado.
 *
 * Deterministica: a mesma entrada devolve sempre a mesma saida, e a recomputacao
 * do historico depende disso.
 */
export function rateGameDay(input: { players: MmrPlayer[]; matches: MmrMatch[] }): MmrGameDayResult {
  const known = new Map(input.players.map((player) => [player.userId, player]));
  const lookup = (userId: string): MmrPlayer =>
    // O servico monta todos os jogadores da escalacao; o centro e so uma rede de seguranca.
    known.get(userId) ?? { userId, mmr: MMR.BASE, stars: null, gameDaysRated: 0 };
  const ratingOf = (userId: string): number => {
    const player = lookup(userId);
    return expectedRating(player.stars, player.mmr);
  };

  const matches = [...input.matches].sort(
    (a, b) => a.orderIndex - b.orderIndex || a.matchId.localeCompare(b.matchId),
  );
  const rateable = matches.filter((match) => {
    const { home, away } = matchSides(match);
    return home.userIds.length > 0 && away.userIds.length > 0;
  });

  const teamIds = new Set(rateable.flatMap((match) => [match.homeTeamId, match.awayTeamId]));
  if (rateable.length < MMR.MIN_MATCHES_TO_RATE || teamIds.size < MMR.MIN_TEAMS_TO_RATE) {
    return {
      players: [],
      concededAverage: 0,
      mvpUserId: null,
      skipped: "A pelada não teve partidas encerradas com escalação para contabilizar.",
    };
  }

  // Media da propria pelada, e nao uma constante: continua certa se goalsToWin ou a duracao mudarem.
  const totalGoals = rateable.reduce((sum, match) => sum + match.homeScore + match.awayScore, 0);
  const concededAverage = totalGoals / (2 * rateable.length);

  const accumulators = new Map<string, Accumulator>();
  const accumulatorOf = (userId: string): Accumulator => {
    let entry = accumulators.get(userId);
    if (!entry) {
      entry = {
        player: lookup(userId),
        matches: 0,
        goals: 0,
        assists: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        conceded: 0,
        cleanSheets: 0,
        resultDelta: 0,
        attackDelta: 0,
        defenseDelta: 0,
        perMatch: [],
      };
      accumulators.set(userId, entry);
    }
    return entry;
  };

  for (const match of rateable) {
    const { home, away } = matchSides(match);
    const sides = [
      { side: home, opponent: away, conceded: match.awayScore, winnerKey: "HOME", loserKey: "AWAY" },
      { side: away, opponent: home, conceded: match.homeScore, winnerKey: "AWAY", loserKey: "HOME" },
    ] as const;

    for (const { side, opponent, conceded, winnerKey, loserKey } of sides) {
      const teamRating = mean(side.userIds.map(ratingOf));
      const opponentRating = mean(opponent.userIds.map(ratingOf));
      const expected = 1 / (1 + Math.pow(10, (opponentRating - teamRating) / MMR.ELO_SCALE));
      // result nulo conta como empate, igual a summarizeTeam em team-record.ts
      const outcome = match.result === winnerKey ? "WIN" : match.result === loserKey ? "LOSS" : "DRAW";
      const score = outcome === "WIN" ? 1 : outcome === "LOSS" ? 0 : 0.5;
      const resultDelta = round2(MMR.K_RESULT * (score - expected));

      // Bolo do time: gols e assistencias dele naquela partida.
      const teamEvents = match.events.filter((event) => event.teamId === side.teamId);
      const teamGoals = teamEvents.filter((event) => event.type === "GOAL").length;
      const teamAssists = teamEvents.length - teamGoals;
      const pie = MMR.GOAL_POINTS * teamGoals + MMR.ASSIST_POINTS * teamAssists;

      // Todo mundo em quadra divide o bolo pelo esperado, sem peso por posicao.
      const weights = side.userIds.map((userId) => quotaLevel(ratingOf(userId)));
      const weightSum = weights.reduce((sum, weight) => sum + weight, 0);

      // Gol sofrido pesa igual para todos, goleiro inclusive: o time inteiro defende.
      const defenseDelta = round2(
        clamp(MMR.K_DEFENSE * (concededAverage - conceded), -MMR.MATCH_DEFENSE_CAP, MMR.MATCH_DEFENSE_CAP),
      );

      side.userIds.forEach((userId, index) => {
        const goals = teamEvents.filter((event) => event.userId === userId && event.type === "GOAL").length;
        const assists = teamEvents.filter((event) => event.userId === userId && event.type === "ASSIST").length;

        const share = weightSum > 0 ? weights[index] / weightSum : 1 / side.userIds.length;
        const quota = MMR.ATTACK_EXPECTED_SHARE * share * pie;
        const points = MMR.GOAL_POINTS * goals + MMR.ASSIST_POINTS * assists;
        const attackDelta = round2(
          clamp(MMR.K_ATTACK * (points - quota), -MMR.MATCH_ATTACK_CAP, MMR.MATCH_ATTACK_CAP),
        );

        const entry = accumulatorOf(userId);
        entry.matches += 1;
        entry.goals += goals;
        entry.assists += assists;
        entry.conceded += conceded;
        if (conceded === 0) entry.cleanSheets += 1;
        if (outcome === "WIN") entry.won += 1;
        else if (outcome === "LOSS") entry.lost += 1;
        else entry.drawn += 1;
        entry.resultDelta += resultDelta;
        entry.attackDelta += attackDelta;
        entry.defenseDelta += defenseDelta;
        entry.perMatch.push({
          matchId: match.matchId,
          orderIndex: match.orderIndex,
          opponentTeamId: opponent.teamId,
          teamRating: round1(teamRating),
          opponentRating: round1(opponentRating),
          expected: Math.round(expected * 10000) / 10000,
          outcome,
          goals,
          assists,
          conceded,
          resultDelta,
          attackDelta,
          defenseDelta,
        });
      });
    }
  }

  const entries = [...accumulators.values()];

  // Normalizacao: o que sobrou de positivo (a margem de 25% do ataque) e descontado
  // de todos, proporcional as partidas jogadas. A soma dos blocos da pelada vira zero.
  const blocksTotal = entries.reduce(
    (sum, entry) => sum + entry.resultDelta + entry.attackDelta + entry.defenseDelta,
    0,
  );
  const matchesTotal = entries.reduce((sum, entry) => sum + entry.matches, 0);
  const surplusPerMatch = blocksTotal / matchesTotal;

  const players = entries.map<MmrPlayerResult>((entry) => {
    const resultDelta = round2(entry.resultDelta);
    const attackDelta = round2(entry.attackDelta);
    const defenseDelta = round2(entry.defenseDelta);
    const normalizeDelta = round2(-entry.matches * surplusPerMatch);

    const stake = stakeFactor(entry.player.stars);
    const calibration = calibrationFactor(entry.player.gameDaysRated);
    const raw = (resultDelta + attackDelta + defenseDelta + normalizeDelta) * stake * calibration;
    const cap = calibration > 1 ? MMR.GAMEDAY_CAP_CALIBRATING : MMR.GAMEDAY_CAP;
    const delta = round2(clamp(raw, -cap, cap));

    return {
      userId: entry.player.userId,
      mmrBefore: entry.player.mmr,
      mmrAfter: clamp(round1(entry.player.mmr + delta), MMR.MIN, MMR.MAX),
      delta,
      resultDelta,
      attackDelta,
      defenseDelta,
      normalizeDelta,
      stakeFactor: stake,
      calibrationFactor: calibration,
      capped: Math.abs(raw) > cap,
      starsUsed: entry.player.stars,
      matches: entry.matches,
      goals: entry.goals,
      assists: entry.assists,
      won: entry.won,
      drawn: entry.drawn,
      lost: entry.lost,
      conceded: entry.conceded,
      cleanSheets: entry.cleanSheets,
      perMatch: entry.perMatch,
    };
  });

  // MVP da pelada (D25): melhor desempenho antes do fator de aposta; no empate, o
  // userId menor, so para ser deterministico.
  let mvp: { userId: string; performance: number } | null = null;
  for (const player of players) {
    const performance = nightPerformance(player);
    if (performance <= 0) continue;
    if (
      !mvp ||
      performance > mvp.performance ||
      (performance === mvp.performance && player.userId < mvp.userId)
    ) {
      mvp = { userId: player.userId, performance };
    }
  }

  return {
    players,
    concededAverage: round2(concededAverage),
    mvpUserId: mvp ? mvp.userId : null,
    skipped: null,
  };
}
