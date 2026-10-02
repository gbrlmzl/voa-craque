/**
 * Regras da substituicao em quadra.
 *
 * Modulo puro, no mesmo estilo de match-engine.ts: recebe estado, devolve
 * resultado e nao toca no banco nem no relogio. O servico (src/services/match.ts)
 * e o modal usam as mesmas funcoes, entao a interface nunca oferece uma troca
 * que o servidor recusaria.
 */

export type LineupPlayer = {
  userId: string;
  teamId: string;
  isKeeper: boolean;
  /** Comecou a partida. */
  starter: boolean;
  /** Esta em quadra agora. */
  onCourt: boolean;
};

export type RosterPlayer = { userId: string; isKeeper: boolean; strength: number };

/** Elenco fixo de um time na pelada (as linhas de TeamPlayer). */
export type TeamRoster = { teamId: string; players: RosterPlayer[] };

export type BenchOrigin = "LEFT_MATCH" | "QUEUE" | "RESERVE";

export type BenchPlayer = {
  userId: string;
  origin: BenchOrigin;
  /** Time do elenco fixo do jogador; null quando ele esta nas reservas. */
  rosterTeamId: string | null;
  /** So em LEFT_MATCH: o time pelo qual ele jogou e saiu desta partida. */
  leftTeamId: string | null;
};

export type SubstitutionInput = {
  teamId: string;
  outUserId: string;
  inUserId: string;
  permanent: boolean;
};

/** O que o servico e o modal enxergam da partida para decidir uma troca. */
export type SubstitutionView = {
  homeTeamId: string;
  awayTeamId: string;
  /** Quem esta em quadra agora, com o time. */
  court: { userId: string; teamId: string }[];
  bench: BenchPlayer[];
  /** userIds do elenco fixo de cada time que esta em quadra. */
  rosters: Record<string, string[]>;
};

export type SubstitutionPlan = SubstitutionInput & {
  /** Time do elenco fixo de quem entra; null quando ele vem das reservas. */
  fromTeamId: string | null;
  /** Quem entra ja jogou esta partida e volta para quadra. */
  reentry: boolean;
};

export type SubstitutionResult =
  | { ok: true; plan: SubstitutionPlan }
  | { ok: false; error: string };

export const PERMANENT_BLOCKED_NOT_ROSTER =
  "Quem sai entrou só nesta partida e não faz parte do elenco fixo do time.";
export const PERMANENT_BLOCKED_IN_ROSTER = "Quem entra já é do elenco fixo deste time.";

export class SubstitutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubstitutionError";
  }
}

type BenchSource = {
  homeTeamId: string;
  awayTeamId: string;
  lineup: LineupPlayer[];
  /** Elenco fixo de todos os times da pelada, com a posicao na fila (null = em quadra). */
  rosters: { teamId: string; queuePosition: number | null; userIds: string[] }[];
  reserveIds: string[];
};

/**
 * Todo mundo que pode, em tese, entrar numa partida: quem saiu dela, quem
 * espera na fila (na ordem da fila) e as reservas. Quem esta em quadra nao
 * entra na lista. Quem pode entrar por qual time sai de eligibleBench.
 */
export function buildBench(source: BenchSource): BenchPlayer[] {
  const { lineup, rosters, reserveIds, homeTeamId, awayTeamId } = source;
  const inLineup = new Set(lineup.map((row) => row.userId));
  const rosterTeamOf = new Map<string, string>();
  for (const roster of rosters) {
    for (const userId of roster.userIds) rosterTeamOf.set(userId, roster.teamId);
  }

  const bench: BenchPlayer[] = lineup
    .filter((row) => !row.onCourt)
    .map((row) => ({
      userId: row.userId,
      origin: "LEFT_MATCH" as const,
      rosterTeamId: rosterTeamOf.get(row.userId) ?? null,
      leftTeamId: row.teamId,
    }));

  const waiting = rosters
    .filter(
      (roster) =>
        roster.queuePosition !== null && roster.teamId !== homeTeamId && roster.teamId !== awayTeamId,
    )
    .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0));
  for (const roster of waiting) {
    for (const userId of roster.userIds) {
      if (inLineup.has(userId)) continue;
      bench.push({ userId, origin: "QUEUE", rosterTeamId: roster.teamId, leftTeamId: null });
    }
  }

  for (const userId of reserveIds) {
    if (inLineup.has(userId)) continue;
    bench.push({ userId, origin: "RESERVE", rosterTeamId: null, leftTeamId: null });
  }

  return bench;
}

/** Quem pode entrar pelo time: fica de fora quem saiu da partida pelo adversario. */
export function eligibleBench<T extends BenchPlayer>(bench: T[], teamId: string): T[] {
  return bench.filter((player) => player.origin !== "LEFT_MATCH" || player.leftTeamId === teamId);
}

export type BenchGroups<T extends BenchPlayer> = {
  left: T[];
  queue: { teamId: string; players: T[] }[];
  reserves: T[];
};

/** Monta os grupos do modal: "Saíram desta partida", times da fila na ordem, "Reservas". */
export function groupBench<T extends BenchPlayer>(
  bench: T[],
  teamId: string,
  queueOrder: string[],
): BenchGroups<T> {
  const eligible = eligibleBench(bench, teamId);
  return {
    left: eligible.filter((player) => player.origin === "LEFT_MATCH"),
    queue: queueOrder
      .map((queueTeamId) => ({
        teamId: queueTeamId,
        players: eligible.filter(
          (player) => player.origin === "QUEUE" && player.rosterTeamId === queueTeamId,
        ),
      }))
      .filter((group) => group.players.length > 0),
    reserves: eligible.filter((player) => player.origin === "RESERVE"),
  };
}

/**
 * Motivo pelo qual a troca nao pode valer ate o fim da pelada, ou null quando
 * pode. So vale quando quem sai e do elenco fixo do time em quadra e quem entra
 * nao e: a troca de elenco so faz sentido entre dois elencos diferentes.
 */
export function permanentBlocker(params: {
  teamId: string;
  teamRoster: string[];
  outUserId: string;
  inPlayer: BenchPlayer;
}): string | null {
  const { teamId, teamRoster, outUserId, inPlayer } = params;
  if (inPlayer.rosterTeamId === teamId) return PERMANENT_BLOCKED_IN_ROSTER;
  if (!teamRoster.includes(outUserId)) return PERMANENT_BLOCKED_NOT_ROSTER;
  return null;
}

export function evaluateSubstitution(
  view: SubstitutionView,
  input: SubstitutionInput,
): SubstitutionResult {
  const { teamId, outUserId, inUserId, permanent } = input;
  const fail = (error: string): SubstitutionResult => ({ ok: false, error });

  if (teamId !== view.homeTeamId && teamId !== view.awayTeamId) {
    return fail("Este time não está nesta partida.");
  }
  if (outUserId === inUserId) {
    return fail("Quem sai e quem entra precisam ser jogadores diferentes.");
  }
  if (!view.court.some((player) => player.userId === outUserId && player.teamId === teamId)) {
    return fail("Quem sai não está em quadra por este time.");
  }
  if (view.court.some((player) => player.userId === inUserId)) {
    return fail("Quem entra já está em quadra.");
  }

  const candidate = view.bench.find((player) => player.userId === inUserId);
  if (!candidate) return fail("Este jogador não está disponível para entrar.");
  if (candidate.origin === "LEFT_MATCH" && candidate.leftTeamId !== teamId) {
    return fail("Este jogador já saiu da partida pelo time adversário.");
  }

  if (permanent) {
    const blocker = permanentBlocker({
      teamId,
      teamRoster: view.rosters[teamId] ?? [],
      outUserId,
      inPlayer: candidate,
    });
    if (blocker) return fail(blocker);
  }

  return {
    ok: true,
    plan: {
      teamId,
      outUserId,
      inUserId,
      permanent,
      fromTeamId: candidate.rosterTeamId,
      reentry: candidate.origin === "LEFT_MATCH",
    },
  };
}

export type LineupChange = {
  /** Quem sai: a linha continua na partida, so deixa de estar em quadra. */
  deactivate: string;
  /** Quem entra: reativa a linha que ja existe ou cria uma nova. */
  activate: { kind: "reactivate"; userId: string } | { kind: "create"; row: LineupPlayer };
};

/**
 * O que muda na escalacao da partida. Cada jogador tem uma linha so por
 * partida: na reentrada a linha antiga volta para quadra. Quem entra pela
 * primeira vez assume a vaga de quem saiu, inclusive a de goleiro.
 */
export function planLineupChange(lineup: LineupPlayer[], plan: SubstitutionPlan): LineupChange {
  const outRow = lineup.find((row) => row.userId === plan.outUserId);
  if (!outRow) throw new SubstitutionError("Quem sai não está na escalação da partida.");

  const existing = lineup.find((row) => row.userId === plan.inUserId);
  if (existing) {
    return { deactivate: plan.outUserId, activate: { kind: "reactivate", userId: plan.inUserId } };
  }

  return {
    deactivate: plan.outUserId,
    activate: {
      kind: "create",
      row: {
        userId: plan.inUserId,
        teamId: plan.teamId,
        isKeeper: outRow.isKeeper,
        starter: false,
        onCourt: true,
      },
    },
  };
}

export function averageStrength(players: { strength: number }[]): number {
  if (players.length === 0) return 0;
  const total = players.reduce((sum, player) => sum + player.strength, 0);
  return Math.round((total / players.length) * 100) / 100;
}

export type RosterSwap = {
  /** Time em quadra, ja com quem entrou. */
  team: TeamRoster;
  /** Time de onde veio quem entrou, ja com quem saiu. null quando veio das reservas. */
  origin: TeamRoster | null;
  reserveIds: string[];
};

/**
 * Troca permanente: quem entra assume a vaga de quem sai (herdando o isKeeper
 * dela) e quem sai vai para a vaga de onde o outro veio, ou para as reservas.
 * A forca viaja com o jogador. Quem vem das reservas nao tem linha de elenco,
 * entao a forca dele entra de fora.
 */
export function swapRoster(params: {
  team: TeamRoster;
  origin: TeamRoster | null;
  reserveIds: string[];
  outUserId: string;
  inUserId: string;
  inStrength: number | null;
}): RosterSwap {
  const { team, origin, reserveIds, outUserId, inUserId, inStrength } = params;

  const outSlot = team.players.find((player) => player.userId === outUserId);
  if (!outSlot) throw new SubstitutionError(PERMANENT_BLOCKED_NOT_ROSTER);
  if (team.players.some((player) => player.userId === inUserId)) {
    throw new SubstitutionError(PERMANENT_BLOCKED_IN_ROSTER);
  }

  let inPlayer: RosterPlayer;
  let nextOrigin: TeamRoster | null = null;
  let nextReserves = reserveIds;

  if (origin) {
    const inSlot = origin.players.find((player) => player.userId === inUserId);
    if (!inSlot) throw new SubstitutionError("Quem entra não está no elenco de origem.");
    inPlayer = { userId: inUserId, isKeeper: outSlot.isKeeper, strength: inSlot.strength };
    nextOrigin = {
      teamId: origin.teamId,
      players: origin.players.map((player) =>
        player.userId === inUserId
          ? { userId: outUserId, isKeeper: inSlot.isKeeper, strength: outSlot.strength }
          : player,
      ),
    };
  } else {
    if (!reserveIds.includes(inUserId)) {
      throw new SubstitutionError("Quem entra não está nas reservas.");
    }
    if (inStrength === null) {
      throw new SubstitutionError("Falta a força de quem vem das reservas.");
    }
    inPlayer = { userId: inUserId, isKeeper: outSlot.isKeeper, strength: inStrength };
    nextReserves = [...reserveIds.filter((id) => id !== inUserId), outUserId];
  }

  return {
    team: {
      teamId: team.teamId,
      players: team.players.map((player) => (player.userId === outUserId ? inPlayer : player)),
    },
    origin: nextOrigin,
    reserveIds: nextReserves,
  };
}

export type SubstitutionSummary = {
  id: string;
  teamId: string;
  outUserId: string;
  inUserId: string;
  createdAt: number;
};

export type UndoPlan =
  | {
      kind: "OK";
      /** Quem entrou: a linha fica fora de quadra (ja jogou) ou e apagada (nunca jogou). */
      inFate: "DEACTIVATE" | "DELETE";
    }
  | { kind: "NOT_LATEST" }
  | { kind: "BLOCKED"; userId: string };

function isAfter(a: SubstitutionSummary, b: SubstitutionSummary): boolean {
  return a.createdAt > b.createdAt || (a.createdAt === b.createdAt && a.id > b.id);
}

export function latestSubstitution<T extends SubstitutionSummary>(substitutions: T[]): T | null {
  let latest: T | null = null;
  for (const substitution of substitutions) {
    if (!latest || isAfter(substitution, latest)) latest = substitution;
  }
  return latest;
}

/**
 * Decide se a troca pode ser desfeita. So a mais recente da partida, e so se
 * quem entrou nao tem gol nem assistencia registrados depois dela.
 */
export function planUndo(params: {
  target: SubstitutionSummary;
  substitutions: SubstitutionSummary[];
  lineup: LineupPlayer[];
  events: { userId: string; createdAt: number }[];
}): UndoPlan {
  const { target, substitutions, lineup, events } = params;

  if (latestSubstitution(substitutions)?.id !== target.id) return { kind: "NOT_LATEST" };

  if (events.some((event) => event.userId === target.inUserId && event.createdAt > target.createdAt)) {
    return { kind: "BLOCKED", userId: target.inUserId };
  }

  const wasStarter = lineup.some((row) => row.userId === target.inUserId && row.starter);
  const enteredBefore = substitutions.some(
    (substitution) => substitution.id !== target.id && substitution.inUserId === target.inUserId,
  );
  return { kind: "OK", inFate: wasStarter || enteredBefore ? "DEACTIVATE" : "DELETE" };
}

export type FeedEntry<E, S> =
  | { kind: "event"; at: number; item: E }
  | { kind: "substitution"; at: number; item: S };

/** Lances da partida: gols, assistencias e trocas juntos, do mais recente para o mais antigo. */
export function buildMatchFeed<E extends { createdAt: string }, S extends { createdAt: string }>(
  events: E[],
  substitutions: S[],
): FeedEntry<E, S>[] {
  const entries: FeedEntry<E, S>[] = [
    ...events.map((item) => ({ kind: "event" as const, at: Date.parse(item.createdAt), item })),
    ...substitutions.map((item) => ({
      kind: "substitution" as const,
      at: Date.parse(item.createdAt),
      item,
    })),
  ];
  return entries.sort((a, b) => b.at - a.at);
}
