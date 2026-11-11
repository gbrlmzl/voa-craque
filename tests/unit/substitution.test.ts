import { describe, expect, it } from "vitest";
import {
  PERMANENT_BLOCKED_IN_ROSTER,
  PERMANENT_BLOCKED_NOT_ROSTER,
  SubstitutionError,
  averageStrength,
  buildBench,
  buildMatchFeed,
  eligibleBench,
  evaluateSubstitution,
  groupBench,
  latestSubstitution,
  permanentBlocker,
  planLineupChange,
  planUndo,
  swapRoster,
  type LineupPlayer,
  type SubstitutionInput,
  type SubstitutionPlan,
  type SubstitutionSummary,
  type SubstitutionView,
  type TeamRoster,
} from "@/lib/substitution";

// Times A x C em quadra, D e E na fila (D primeiro), Edu e Fabio nas reservas.
const ROSTERS = [
  { teamId: "A", queuePosition: null, userIds: ["davi", "alan", "arthur"] },
  { teamId: "C", queuePosition: null, userIds: ["bruno", "cleber", "cesar"] },
  { teamId: "D", queuePosition: 0, userIds: ["dida", "dani"] },
  { teamId: "E", queuePosition: 1, userIds: ["caio", "eder"] },
];
const RESERVES = ["edu", "fabio"];

function startingLineup(): LineupPlayer[] {
  const keepers = new Set(["davi", "cesar"]);
  return ["A", "C"].flatMap((teamId) =>
    ROSTERS.find((roster) => roster.teamId === teamId)!.userIds.map((userId) => ({
      userId,
      teamId,
      isKeeper: keepers.has(userId),
      starter: true,
      onCourt: true,
    })),
  );
}

function viewOf(lineup: LineupPlayer[]): SubstitutionView {
  return {
    homeTeamId: "A",
    awayTeamId: "C",
    court: lineup.filter((row) => row.onCourt).map((row) => ({ userId: row.userId, teamId: row.teamId })),
    bench: buildBench({ homeTeamId: "A", awayTeamId: "C", lineup, rosters: ROSTERS, reserveIds: RESERVES }),
    rosters: {
      A: ROSTERS[0].userIds,
      C: ROSTERS[1].userIds,
    },
  };
}

function input(overrides: Partial<SubstitutionInput> = {}): SubstitutionInput {
  return { teamId: "C", outUserId: "bruno", inUserId: "caio", permanent: false, ...overrides };
}

/** Aplica uma troca na escalacao em memoria, como o servico faz no banco. */
function apply(lineup: LineupPlayer[], plan: SubstitutionPlan): LineupPlayer[] {
  const change = planLineupChange(lineup, plan);
  const next = lineup.map((row) =>
    row.userId === change.deactivate ? { ...row, onCourt: false } : row,
  );
  if (change.activate.kind === "create") return [...next, change.activate.row];
  const userId = change.activate.userId;
  return next.map((row) => (row.userId === userId ? { ...row, onCourt: true } : row));
}

function substitute(lineup: LineupPlayer[], overrides: Partial<SubstitutionInput> = {}) {
  const result = evaluateSubstitution(viewOf(lineup), input(overrides));
  if (!result.ok) throw new Error(result.error);
  return { plan: result.plan, lineup: apply(lineup, result.plan) };
}

describe("lista de quem pode entrar", () => {
  it("separa quem saiu, a fila na ordem e as reservas", () => {
    const { lineup } = substitute(startingLineup());
    const bench = buildBench({
      homeTeamId: "A",
      awayTeamId: "C",
      lineup,
      rosters: ROSTERS,
      reserveIds: RESERVES,
    });

    expect(bench.map((player) => [player.userId, player.origin])).toEqual([
      ["bruno", "LEFT_MATCH"],
      ["dida", "QUEUE"],
      ["dani", "QUEUE"],
      ["eder", "QUEUE"],
      ["edu", "RESERVE"],
      ["fabio", "RESERVE"],
    ]);
  });

  it("nao lista quem esta em quadra, mesmo que o elenco dele seja de um time da fila", () => {
    const { lineup } = substitute(startingLineup());
    const bench = viewOf(lineup).bench;
    expect(bench.some((player) => player.userId === "caio")).toBe(false);
  });

  it("quem saiu so volta pelo mesmo time", () => {
    const { lineup } = substitute(startingLineup());
    const bench = viewOf(lineup).bench;

    expect(eligibleBench(bench, "C").some((player) => player.userId === "bruno")).toBe(true);
    expect(eligibleBench(bench, "A").some((player) => player.userId === "bruno")).toBe(false);
  });

  it("agrupa para o modal: saíram, times da fila na ordem, reservas", () => {
    const { lineup } = substitute(startingLineup());
    const groups = groupBench(viewOf(lineup).bench, "C", ["D", "E"]);

    expect(groups.left.map((player) => player.userId)).toEqual(["bruno"]);
    expect(groups.queue.map((group) => [group.teamId, group.players.map((p) => p.userId)])).toEqual([
      ["D", ["dida", "dani"]],
      ["E", ["eder"]],
    ]);
    expect(groups.reserves.map((player) => player.userId)).toEqual(["edu", "fabio"]);
  });

  it("omite do grupo da fila o time sem ninguem disponivel", () => {
    let lineup = startingLineup();
    lineup = substitute(lineup, { outUserId: "bruno", inUserId: "caio" }).lineup;
    lineup = substitute(lineup, { outUserId: "cleber", inUserId: "eder" }).lineup;

    const groups = groupBench(viewOf(lineup).bench, "C", ["D", "E"]);
    expect(groups.queue.map((group) => group.teamId)).toEqual(["D"]);
  });
});

describe("o caso do beta: so nesta partida", () => {
  it("Caio, do time E, entra no lugar de Bruno, do time C", () => {
    const result = evaluateSubstitution(viewOf(startingLineup()), input());

    expect(result).toEqual({
      ok: true,
      plan: {
        teamId: "C",
        outUserId: "bruno",
        inUserId: "caio",
        permanent: false,
        fromTeamId: "E",
        reentry: false,
      },
    });
  });

  it("Bruno sai de quadra e Caio ganha uma linha nova de reserva do banco", () => {
    const { lineup } = substitute(startingLineup());

    expect(lineup.find((row) => row.userId === "bruno")).toMatchObject({ onCourt: false, starter: true });
    expect(lineup.find((row) => row.userId === "caio")).toEqual({
      userId: "caio",
      teamId: "C",
      isKeeper: false,
      starter: false,
      onCourt: true,
    });
    expect(lineup.filter((row) => row.teamId === "C" && row.onCourt).map((row) => row.userId)).toEqual([
      "cleber",
      "cesar",
      "caio",
    ]);
  });

  it("quem entra assume a vaga de goleiro de quem saiu", () => {
    const { lineup } = substitute(startingLineup(), { outUserId: "cesar", inUserId: "edu" });
    expect(lineup.find((row) => row.userId === "edu")?.isKeeper).toBe(true);
  });

  it("a escalacao final nao duplica ninguem", () => {
    let lineup = startingLineup();
    lineup = substitute(lineup).lineup;
    lineup = substitute(lineup, { outUserId: "caio", inUserId: "bruno" }).lineup;

    const ids = lineup.map((row) => row.userId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("reentrada", () => {
  it("Bruno volta no lugar de Caio e a troca permanente fica indisponivel", () => {
    const afterFirst = substitute(startingLineup()).lineup;
    const view = viewOf(afterFirst);

    const groups = groupBench(view.bench, "C", ["D", "E"]);
    expect(groups.left.map((player) => player.userId)).toEqual(["bruno"]);

    const temporary = evaluateSubstitution(view, input({ outUserId: "caio", inUserId: "bruno" }));
    expect(temporary).toMatchObject({
      ok: true,
      plan: { reentry: true, fromTeamId: "C", permanent: false },
    });

    const permanent = evaluateSubstitution(
      view,
      input({ outUserId: "caio", inUserId: "bruno", permanent: true }),
    );
    expect(permanent).toEqual({ ok: false, error: expect.stringContaining("já é do elenco fixo") });
  });

  it("a linha de Bruno e reativada, sem criar outra", () => {
    const first = substitute(startingLineup()).lineup;
    const { lineup } = substitute(first, { outUserId: "caio", inUserId: "bruno" });

    expect(lineup.filter((row) => row.userId === "bruno")).toHaveLength(1);
    expect(lineup.find((row) => row.userId === "bruno")).toMatchObject({ onCourt: true, starter: true });
    expect(lineup.find((row) => row.userId === "caio")).toMatchObject({ onCourt: false, starter: false });
  });

  it("quem entrou por uma troca temporaria nao pode ser trocado de forma permanente", () => {
    const afterFirst = substitute(startingLineup()).lineup;
    const result = evaluateSubstitution(
      viewOf(afterFirst),
      input({ outUserId: "caio", inUserId: "dida", permanent: true }),
    );
    expect(result).toEqual({ ok: false, error: PERMANENT_BLOCKED_NOT_ROSTER });
  });

  it("Caio, que saiu do time C, pode voltar de forma permanente por alguem do elenco de C", () => {
    let lineup = startingLineup();
    lineup = substitute(lineup).lineup;
    lineup = substitute(lineup, { outUserId: "caio", inUserId: "bruno" }).lineup;

    const result = evaluateSubstitution(
      viewOf(lineup),
      input({ outUserId: "cleber", inUserId: "caio", permanent: true }),
    );
    expect(result).toMatchObject({ ok: true, plan: { fromTeamId: "E", reentry: true, permanent: true } });
  });
});

describe("entradas invalidas", () => {
  const view = viewOf(startingLineup());
  const messageOf = (overrides: Partial<SubstitutionInput>, current = view) => {
    const result = evaluateSubstitution(current, input(overrides));
    return result.ok ? null : result.error;
  };

  it("quem sai nao esta em quadra por aquele time", () => {
    expect(messageOf({ outUserId: "dida" })).toBe("Quem sai não está em quadra por este time.");
    expect(messageOf({ outUserId: "alan" })).toBe("Quem sai não está em quadra por este time.");
  });

  it("quem sai ja saiu da quadra", () => {
    const after = viewOf(substitute(startingLineup()).lineup);
    expect(messageOf({ outUserId: "bruno", inUserId: "dida" }, after)).toBe(
      "Quem sai não está em quadra por este time.",
    );
  });

  it("quem entra esta em quadra, no mesmo time ou no adversario", () => {
    expect(messageOf({ inUserId: "cleber" })).toBe("Quem entra já está em quadra.");
    expect(messageOf({ inUserId: "alan" })).toBe("Quem entra já está em quadra.");
  });

  it("quem entra saiu desta partida pelo time adversario", () => {
    const first = evaluateSubstitution(view, input({ teamId: "A", outUserId: "alan", inUserId: "dida" }));
    if (!first.ok) throw new Error(first.error);
    const after = viewOf(apply(startingLineup(), first.plan));

    expect(messageOf({ outUserId: "bruno", inUserId: "alan" }, after)).toBe(
      "Este jogador já saiu da partida pelo time adversário.",
    );
  });

  it("quem sai e quem entra sao a mesma pessoa", () => {
    expect(messageOf({ outUserId: "bruno", inUserId: "bruno" })).toBe(
      "Quem sai e quem entra precisam ser jogadores diferentes.",
    );
  });

  it("o time nao esta na partida", () => {
    expect(messageOf({ teamId: "D", outUserId: "dida", inUserId: "caio" })).toBe(
      "Este time não está nesta partida.",
    );
  });

  it("quem entra nao esta na fila nem nas reservas", () => {
    expect(messageOf({ inUserId: "fantasma" })).toBe("Este jogador não está disponível para entrar.");
  });

  it("troca permanente quando quem sai nao e do elenco", () => {
    const after = viewOf(substitute(startingLineup()).lineup);
    expect(messageOf({ outUserId: "caio", inUserId: "edu", permanent: true }, after)).toBe(
      PERMANENT_BLOCKED_NOT_ROSTER,
    );
  });
});

describe("troca permanente permitida", () => {
  it("so quando quem sai e do elenco e quem entra nao e", () => {
    const view = viewOf(startingLineup());
    const blocker = (outUserId: string, inUserId: string) =>
      permanentBlocker({
        teamId: "C",
        teamRoster: view.rosters.C,
        outUserId,
        inPlayer: view.bench.find((player) => player.userId === inUserId)!,
      });

    expect(blocker("bruno", "caio")).toBeNull();
    expect(blocker("bruno", "edu")).toBeNull();
    expect(blocker("caio", "edu")).toBe(PERMANENT_BLOCKED_NOT_ROSTER);
    expect(
      permanentBlocker({
        teamId: "C",
        teamRoster: view.rosters.C,
        outUserId: "bruno",
        inPlayer: { userId: "cleber", origin: "LEFT_MATCH", rosterTeamId: "C", leftTeamId: "C" },
      }),
    ).toBe(PERMANENT_BLOCKED_IN_ROSTER);
  });
});

describe("novo elenco depois de uma troca permanente", () => {
  const teamA: TeamRoster = {
    teamId: "A",
    players: [
      { userId: "davi", isKeeper: true, strength: 70 },
      { userId: "alan", isKeeper: false, strength: 50 },
      { userId: "arthur", isKeeper: false, strength: 60 },
    ],
  };
  const teamE: TeamRoster = {
    teamId: "E",
    players: [
      { userId: "caio", isKeeper: false, strength: 40 },
      { userId: "eder", isKeeper: true, strength: 80 },
    ],
  };

  it("das reservas: Edu vira goleiro do A e Davi vai para as reservas", () => {
    const swap = swapRoster({
      team: teamA,
      origin: null,
      reserveIds: ["edu", "fabio"],
      outUserId: "davi",
      inUserId: "edu",
      inStrength: 90,
    });

    expect(swap.team.players.find((player) => player.userId === "edu")).toEqual({
      userId: "edu",
      isKeeper: true,
      strength: 90,
    });
    expect(swap.team.players.some((player) => player.userId === "davi")).toBe(false);
    expect(swap.origin).toBeNull();
    expect(swap.reserveIds).toEqual(["fabio", "davi"]);
    expect(averageStrength(swap.team.players)).toBe(66.67);
  });

  it("de um time da fila: os dois trocam de vaga e a forca viaja com o jogador", () => {
    const swap = swapRoster({
      team: teamA,
      origin: teamE,
      reserveIds: ["edu"],
      outUserId: "alan",
      inUserId: "caio",
      inStrength: null,
    });

    expect(swap.team.players.find((player) => player.userId === "caio")).toEqual({
      userId: "caio",
      isKeeper: false,
      strength: 40,
    });
    // Alan ocupa a vaga de Caio no E, com a forca dele (50), nao a de Caio.
    expect(swap.origin?.players.find((player) => player.userId === "alan")).toEqual({
      userId: "alan",
      isKeeper: false,
      strength: 50,
    });
    expect(swap.reserveIds).toEqual(["edu"]);
    expect(averageStrength(swap.team.players)).toBe(56.67);
    expect(averageStrength(swap.origin!.players)).toBe(65);
  });

  it("quem entra herda o isKeeper da vaga, nao o proprio", () => {
    const swap = swapRoster({
      team: teamA,
      origin: teamE,
      reserveIds: [],
      outUserId: "davi",
      inUserId: "eder",
      inStrength: null,
    });

    expect(swap.team.players.find((player) => player.userId === "eder")?.isKeeper).toBe(true);
    // E a vaga de Eder no E continua sendo de goleiro.
    expect(swap.origin?.players.find((player) => player.userId === "davi")?.isKeeper).toBe(true);
  });

  it("nao altera os elencos recebidos", () => {
    const before = JSON.stringify([teamA, teamE]);
    swapRoster({
      team: teamA,
      origin: teamE,
      reserveIds: [],
      outUserId: "alan",
      inUserId: "caio",
      inStrength: null,
    });
    expect(JSON.stringify([teamA, teamE])).toBe(before);
  });

  it("recusa estado inconsistente", () => {
    const base = { team: teamA, origin: teamE, reserveIds: ["edu"], inStrength: null };
    expect(() => swapRoster({ ...base, outUserId: "caio", inUserId: "eder" })).toThrow(SubstitutionError);
    expect(() => swapRoster({ ...base, outUserId: "alan", inUserId: "arthur" })).toThrow(SubstitutionError);
    expect(() =>
      swapRoster({ ...base, origin: null, outUserId: "alan", inUserId: "fabio" }),
    ).toThrow(SubstitutionError);
    expect(() =>
      swapRoster({ ...base, origin: null, outUserId: "alan", inUserId: "edu", inStrength: null }),
    ).toThrow(SubstitutionError);
  });

  it("media de elenco vazio e zero", () => {
    expect(averageStrength([])).toBe(0);
  });
});

describe("desfazer", () => {
  const T = 1_700_000_000_000;
  const sub = (id: string, outUserId: string, inUserId: string, offset: number): SubstitutionSummary => ({
    id,
    teamId: "C",
    outUserId,
    inUserId,
    createdAt: T + offset,
  });

  it("acha a troca mais recente, desempatando pelo id", () => {
    const first = sub("s1", "bruno", "caio", 0);
    const second = sub("s2", "cleber", "eder", 1000);
    expect(latestSubstitution([second, first])?.id).toBe("s2");
    expect(latestSubstitution([])).toBeNull();
    expect(
      latestSubstitution([sub("a", "x", "y", 5), sub("b", "x", "z", 5)])?.id,
    ).toBe("b");
  });

  it("so a mais recente da partida pode ser desfeita", () => {
    const first = sub("s1", "bruno", "caio", 0);
    const second = sub("s2", "cleber", "eder", 1000);
    const lineup = startingLineup();

    expect(
      planUndo({ target: first, substitutions: [first, second], lineup, events: [] }),
    ).toEqual({ kind: "NOT_LATEST" });
  });

  it("quem entrou pela primeira vez tem a linha apagada", () => {
    const first = sub("s1", "bruno", "caio", 0);
    const lineup = substitute(startingLineup()).lineup;

    expect(planUndo({ target: first, substitutions: [first], lineup, events: [] })).toEqual({
      kind: "OK",
      inFate: "DELETE",
    });
  });

  it("titular que volta e quem ja tinha entrado antes ficam fora de quadra, sem apagar a linha", () => {
    const first = sub("s1", "bruno", "caio", 0);
    const second = sub("s2", "caio", "bruno", 1000);
    const lineup = apply(substitute(startingLineup()).lineup, {
      teamId: "C",
      outUserId: "caio",
      inUserId: "bruno",
      permanent: false,
      fromTeamId: "C",
      reentry: true,
    });

    expect(
      planUndo({ target: second, substitutions: [first, second], lineup, events: [] }),
    ).toEqual({ kind: "OK", inFate: "DEACTIVATE" });

    const third = sub("s3", "bruno", "caio", 2000);
    expect(
      planUndo({ target: third, substitutions: [first, second, third], lineup, events: [] }),
    ).toEqual({ kind: "OK", inFate: "DEACTIVATE" });
  });

  it("bloqueia quando quem entrou tem gol ou assistencia depois da troca", () => {
    const first = sub("s1", "bruno", "caio", 0);
    const lineup = substitute(startingLineup()).lineup;

    expect(
      planUndo({
        target: first,
        substitutions: [first],
        lineup,
        events: [{ userId: "caio", createdAt: T + 5000 }],
      }),
    ).toEqual({ kind: "BLOCKED", userId: "caio" });
  });

  it("ignora lance de quem entrou registrado antes da troca e lance de outro jogador", () => {
    const first = sub("s1", "bruno", "caio", 0);
    const lineup = substitute(startingLineup()).lineup;

    expect(
      planUndo({
        target: first,
        substitutions: [first],
        lineup,
        events: [
          { userId: "caio", createdAt: T - 5000 },
          { userId: "cleber", createdAt: T + 5000 },
          { userId: "bruno", createdAt: T + 6000 },
        ],
      }),
    ).toMatchObject({ kind: "OK" });
  });
});

describe("lances da partida", () => {
  it("junta eventos e trocas, do mais recente para o mais antigo", () => {
    const events = [
      { id: "e1", createdAt: "2026-01-01T10:01:00.000Z" },
      { id: "e2", createdAt: "2026-01-01T10:05:00.000Z" },
    ];
    const substitutions = [{ id: "s1", createdAt: "2026-01-01T10:03:00.000Z" }];

    expect(
      buildMatchFeed(events, substitutions).map((entry) => [entry.kind, entry.item.id]),
    ).toEqual([
      ["event", "e2"],
      ["substitution", "s1"],
      ["event", "e1"],
    ]);
  });

  it("aceita listas vazias", () => {
    expect(buildMatchFeed([], [])).toEqual([]);
  });
});
