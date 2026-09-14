/**
 * Algoritmo de equilibrio de times.
 *
 * Modulo puro: nao importa Prisma, React nem nada do Next. Recebe jogadores,
 * devolve times e reservas. Testado em tests/team-balancer.test.ts.
 */

export type BalancerPosition = "GOALKEEPER" | "FIXO" | "ALA" | "PIVO";

export type BalancerPlayer = {
  userId: string;
  name: string;
  stars: number | null;
  heightCm: number | null;
  weightKg: number | null;
  position: BalancerPosition | null;
};

export type RatedPlayer = BalancerPlayer & {
  /** 0..100 */
  strength: number;
  starsUsed: number;
  unrated: boolean;
  isKeeper: boolean;
};

export type BalancedTeam = {
  index: number;
  name: string;
  players: RatedPlayer[];
  totalStrength: number;
  averageStrength: number;
};

export type BalanceResult = {
  teams: BalancedTeam[];
  reserves: RatedPlayer[];
  unratedCount: number;
  medianStars: number;
  /** diferenca entre a media do time mais forte e a do mais fraco */
  spread: number;
};

export type BalanceOptions = {
  teamSize: number;
  maxTeams?: number;
  seed?: number;
};

export class BalanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BalanceError";
  }
}

export const TEAM_NAMES = ["A", "B", "C", "D", "E"] as const;
export const MAX_TEAMS = TEAM_NAMES.length;

const STARS_WEIGHT = 0.8;
const HEIGHT_WEIGHT = 0.12;
const WEIGHT_WEIGHT = 0.08;

const HEIGHT_FLOOR = 160;
const HEIGHT_CEIL = 195;
const WEIGHT_FLOOR = 55;
const WEIGHT_CEIL = 95;

const DEFAULT_STARS = 3;
const DEFAULT_HEIGHT = 175;
const DEFAULT_WEIGHT = 75;

const MAX_SWAP_ROUNDS = 200;

/**
 * Abaixo desta diferenca entre a media do time mais forte e a do mais fraco os
 * times ja estao equilibrados na pratica. Parar aqui preserva a variedade entre
 * um sorteio e outro: otimizar ate o fim levaria sempre ao mesmo arranjo.
 */
const SPREAD_TOLERANCE = 0.75;

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

/** PRNG deterministico: a mesma semente devolve sempre o mesmo sorteio. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

export function computeStrength(stars: number, heightCm: number, weightKg: number): number {
  const starPart = clamp01((stars - 1) / 4) * STARS_WEIGHT;
  const heightPart = clamp01((heightCm - HEIGHT_FLOOR) / (HEIGHT_CEIL - HEIGHT_FLOOR)) * HEIGHT_WEIGHT;
  const weightPart = clamp01((weightKg - WEIGHT_FLOOR) / (WEIGHT_CEIL - WEIGHT_FLOOR)) * WEIGHT_WEIGHT;
  return round2((starPart + heightPart + weightPart) * 100);
}

/** Atribui forca a cada jogador, cobrindo estrelas/altura/peso ausentes com a mediana do grupo. */
export function ratePlayers(players: BalancerPlayer[]): { rated: RatedPlayer[]; medianStars: number } {
  const starValues = players.map((p) => p.stars).filter((s): s is number => typeof s === "number");
  const heightValues = players.map((p) => p.heightCm).filter((h): h is number => typeof h === "number");
  const weightValues = players.map((p) => p.weightKg).filter((w): w is number => typeof w === "number");

  const medianStars = median(starValues) ?? DEFAULT_STARS;
  const medianHeight = median(heightValues) ?? DEFAULT_HEIGHT;
  const medianWeight = median(weightValues) ?? DEFAULT_WEIGHT;

  const rated = players.map<RatedPlayer>((player) => {
    const unrated = typeof player.stars !== "number";
    const starsUsed = unrated ? medianStars : (player.stars as number);
    const heightCm = typeof player.heightCm === "number" ? player.heightCm : medianHeight;
    const weightKg = typeof player.weightKg === "number" ? player.weightKg : medianWeight;
    return {
      ...player,
      starsUsed,
      unrated,
      isKeeper: player.position === "GOALKEEPER",
      strength: computeStrength(starsUsed, heightCm, weightKg),
    };
  });

  return { rated, medianStars };
}

type WorkingTeam = { index: number; players: RatedPlayer[]; total: number };

function teamAverage(team: WorkingTeam): number {
  if (team.players.length === 0) return 0;
  return team.total / team.players.length;
}

function spreadOf(teams: WorkingTeam[]): number {
  const averages = teams.map(teamAverage);
  return Math.max(...averages) - Math.min(...averages);
}

function addPlayer(team: WorkingTeam, player: RatedPlayer): void {
  team.players.push(player);
  team.total = round2(team.total + player.strength);
}

/**
 * Distribui os jogadores em faixas de forca do tamanho do numero de times.
 * Cada time recebe um jogador de cada faixa, e a ordem dentro da faixa e
 * sorteada: dois sorteios da mesma lista dao times diferentes e igualmente
 * equilibrados.
 */
function draftByTiers(
  teams: WorkingTeam[],
  players: RatedPlayer[],
  teamSize: number,
  rand: () => number,
): void {
  const queue = [...players].sort((a, b) => b.strength - a.strength);

  while (queue.length > 0) {
    const available = teams.filter((t) => t.players.length < teamSize);
    if (available.length === 0) throw new BalanceError("Não há vaga disponível nos times.");

    const tier = shuffle(queue.splice(0, available.length), rand);
    const targets = available.sort((a, b) => {
      if (a.players.length !== b.players.length) return a.players.length - b.players.length;
      return a.total - b.total;
    });

    tier.forEach((player, position) => {
      addPlayer(targets[position], player);
    });
  }
}

/**
 * Troca pares de jogadores enquanto isso reduzir a diferenca entre o time mais
 * forte e o mais fraco. Goleiro so troca com goleiro, para nao esvaziar o gol.
 */
function refineBySwaps(teams: WorkingTeam[]): void {
  for (let round = 0; round < MAX_SWAP_ROUNDS; round++) {
    let bestGain = 0;
    let bestSwap: { a: number; b: number; i: number; j: number } | null = null;
    const currentSpread = spreadOf(teams);
    if (currentSpread <= SPREAD_TOLERANCE) return;

    for (let a = 0; a < teams.length; a++) {
      for (let b = a + 1; b < teams.length; b++) {
        const teamA = teams[a];
        const teamB = teams[b];
        for (let i = 0; i < teamA.players.length; i++) {
          for (let j = 0; j < teamB.players.length; j++) {
            const playerA = teamA.players[i];
            const playerB = teamB.players[j];
            if (playerA.isKeeper !== playerB.isKeeper) continue;
            if (playerA.strength === playerB.strength) continue;

            const delta = playerB.strength - playerA.strength;
            const totals = teams.map((t) => t.total);
            totals[a] = round2(totals[a] + delta);
            totals[b] = round2(totals[b] - delta);
            const averages = totals.map((total, index) => total / teams[index].players.length);
            const candidateSpread = Math.max(...averages) - Math.min(...averages);
            const gain = currentSpread - candidateSpread;
            if (gain > bestGain + 1e-9) {
              bestGain = gain;
              bestSwap = { a, b, i, j };
            }
          }
        }
      }
    }

    if (!bestSwap) return;
    const teamA = teams[bestSwap.a];
    const teamB = teams[bestSwap.b];
    const playerA = teamA.players[bestSwap.i];
    const playerB = teamB.players[bestSwap.j];
    teamA.players[bestSwap.i] = playerB;
    teamB.players[bestSwap.j] = playerA;
    teamA.total = round2(teamA.total - playerA.strength + playerB.strength);
    teamB.total = round2(teamB.total - playerB.strength + playerA.strength);
  }
}

export function balanceTeams(players: BalancerPlayer[], options: BalanceOptions): BalanceResult {
  const teamSize = options.teamSize;
  if (!Number.isInteger(teamSize) || teamSize < 1) {
    throw new BalanceError("Tamanho de time inválido.");
  }

  const { rated, medianStars } = ratePlayers(players);
  const maxTeams = Math.min(options.maxTeams ?? MAX_TEAMS, MAX_TEAMS);
  const teamCount = Math.min(maxTeams, Math.floor(rated.length / teamSize));

  if (teamCount < 2) {
    throw new BalanceError(
      `São necessários pelo menos ${teamSize * 2} jogadores inscritos para formar dois times.`,
    );
  }

  const rand = mulberry32(options.seed ?? 1);

  // Quem joga e quem fica de reserva sai no sorteio, nao por forca: sortear de
  // novo troca os reservas.
  const pool = shuffle(rated, rand);
  const starters = pool.slice(0, teamCount * teamSize);
  const reserves = pool.slice(teamCount * teamSize);

  const teams: WorkingTeam[] = Array.from({ length: teamCount }, (_, index) => ({
    index,
    players: [],
    total: 0,
  }));

  // 1) Goleiros primeiro, um por time, para nao concentrar dois no mesmo lado.
  const keepers = shuffle(starters.filter((p) => p.isKeeper), rand);
  const outfield = starters.filter((p) => !p.isKeeper);
  const spareKeepers: RatedPlayer[] = [];
  const teamOrder = shuffle(teams, rand);

  keepers.forEach((keeper, position) => {
    if (position < teamCount) {
      addPlayer(teamOrder[position], keeper);
    } else {
      spareKeepers.push(keeper);
    }
  });

  // 2) Demais jogadores distribuidos por faixas de forca.
  draftByTiers(teams, [...outfield, ...spareKeepers], teamSize, rand);

  // 3) Refino por trocas de pares ate os times ficarem equivalentes.
  refineBySwaps(teams);

  const finalTeams = teams.map<BalancedTeam>((team) => ({
    index: team.index,
    name: TEAM_NAMES[team.index],
    players: [...team.players].sort((a, b) => Number(b.isKeeper) - Number(a.isKeeper) || b.strength - a.strength),
    totalStrength: round2(team.total),
    averageStrength: round2(teamAverage(team)),
  }));

  return {
    teams: finalTeams,
    reserves,
    unratedCount: rated.filter((p) => p.unrated).length,
    medianStars,
    spread: round2(spreadOf(teams)),
  };
}
