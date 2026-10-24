import "dotenv/config";
import { hash } from "bcryptjs";
import type { Foot, Position } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { rotateQueue, type MatchResult } from "@/lib/match-engine";
import { balanceTeams, type BalancerPlayer } from "@/lib/team-balancer";
import { recomputeAllRatings } from "@/services/rating";

/**
 * Seed de teste do ranking geral (MMR): 30 jogadores + 1 admin e 10 peladas
 * encerradas, uma por semana, espalhadas pelos ultimos 3 meses. Cada pelada tem
 * 20 jogadores sorteados pelo balanceador de verdade, partidas pela fila de
 * verdade (quem ganha fica), gols, assistencias e empates por tempo. No fim o
 * MMR sai do servico de verdade (`recomputeAllRatings`), entao o ranking, a
 * ficha, o extrato e as estatisticas por pelada ja aparecem preenchidos.
 *
 * Uso: `npm run teste:ranking-mmr` (no container: `docker exec voacraque-app-dev
 * npm run teste:ranking-mmr`). `SEED=123 npm run teste:ranking-mmr` repete os
 * mesmos dados. Pode rodar de novo: apaga as peladas "Teste MMR · ..." de antes e
 * gera outras, e reaproveita as contas. Recalcula o MMR de TODAS as peladas
 * encerradas do banco, e por isso nao roda em producao.
 */

const TITLE_PREFIX = "Teste MMR · ";
const PLAYER_COUNT = 30;
const KEEPER_COUNT = 6; // 4 goleiros por noite, um por time
const GAME_DAY_COUNT = 10;
const WEEKS_WINDOW = 13; // 3 meses; 10 semanas diferentes dentro dela, uma pelada por semana
const TEAM_SIZE = 5;
const TEAM_COUNT = 4;
const PLAYER_PASSWORD = "Senhapadraoteste";
const ADMIN_USERNAME = "adminteste";
const ADMIN_PASSWORD = "adminteste";
const MATCH_DURATION_MS = 10 * 60_000;

const SEED = Number(process.env.SEED) || Math.floor(Math.random() * 2_000_000_000) + 1;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Sorteio sem reposicao em que quem tem mais peso aparece mais vezes. */
function weightedSample<T>(items: T[], weight: (item: T) => number, count: number): T[] {
  const pool = [...items];
  const chosen: T[] = [];
  while (chosen.length < count && pool.length > 0) {
    const total = pool.reduce((sum, item) => sum + weight(item), 0);
    let r = rand() * total;
    let index = 0;
    for (; index < pool.length - 1; index += 1) {
      r -= weight(pool[index]);
      if (r <= 0) break;
    }
    chosen.push(pool.splice(index, 1)[0]);
  }
  return chosen;
}

const FIRST_NAMES = [
  "Lucas", "Gabriel", "Matheus", "Rafael", "Bruno", "Felipe", "Thiago", "Gustavo", "Rodrigo", "Diego",
  "Vinicius", "Leonardo", "Eduardo", "Marcelo", "Fernando", "Ricardo", "Alexandre", "Daniel", "Andre",
  "Paulo", "Carlos", "Henrique", "Igor", "Renato", "Sergio", "Caio", "Murilo", "Samuel", "Davi", "Otavio",
];
const LAST_NAMES = [
  "Silva", "Santos", "Oliveira", "Souza", "Pereira", "Costa", "Rodrigues", "Almeida", "Nascimento", "Lima",
  "Araujo", "Fernandes", "Carvalho", "Gomes", "Martins", "Rocha", "Ribeiro", "Alves", "Monteiro", "Cardoso",
  "Teixeira", "Correia", "Barbosa", "Moura", "Pinto", "Freitas", "Batista", "Campos", "Duarte", "Nunes",
];
const NICKNAMES = [
  "Formiga", "Canhoto", "Foguete", "Furacao", "Pipoca", "Xerife", "Trator", "Bolinha", "Fenomeno", "Cascudo",
  "Coruja", "Tico", "Buda", "Zaga", "Flecha", "Maluco", "Gaviao", "Tanque", "Rapido", "Mestre",
];
const OUTFIELD_POSITIONS: Position[] = ["FIXO", "ALA", "PIVO"];
const FEET: Foot[] = ["LEFT", "RIGHT", "BOTH"];
// Mais gente no meio da escala do que nas pontas, como num grupo de verdade.
const STAR_WEIGHTS: [number, number][] = [
  [1, 1], [1.5, 1], [2, 2], [2.5, 3], [3, 4], [3.5, 4], [4, 3], [4.5, 2], [5, 1],
];

function randomStars(): number {
  return weightedSample(STAR_WEIGHTS, ([, weight]) => weight, 1)[0][0];
}

/** p (gol a gol) que faz o mandante vencer o primeiro-a-N com probabilidade `matchWin`. */
function goalProbability(matchWin: number, goalsToWin: number): number {
  const winProbability = (p: number) => {
    // P(mandante faz N gols antes do visitante) = soma negativa-binomial
    let sum = 0;
    let comb = 1;
    for (let k = 0; k < goalsToWin; k += 1) {
      if (k > 0) comb = (comb * (goalsToWin - 1 + k)) / k;
      sum += comb * Math.pow(1 - p, k);
    }
    return Math.pow(p, goalsToWin) * sum;
  };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (winProbability(mid) < matchWin) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** As ultimas quintas-feiras, da mais recente para a mais antiga, sempre no passado. */
function recentThursdays(count: number): Date[] {
  const cursor = new Date();
  cursor.setHours(19, 0, 0, 0);
  cursor.setDate(cursor.getDate() - 1);
  while (cursor.getDay() !== 4) cursor.setDate(cursor.getDate() - 1);
  return Array.from({ length: count }, (_, week) => new Date(cursor.getTime() - week * 7 * 24 * 3600_000));
}

type SeedPlayer = {
  userId: string;
  name: string;
  stars: number | null;
  position: Position;
  heightCm: number;
  weightKg: number;
  /** Nivel de verdade, que o app nao conhece: nasce da estrela mais um desvio. So gera os resultados. */
  skill: number;
  /** Quanto o jogador costuma aparecer; quem aparece mais joga mais peladas. */
  presence: number;
};

async function upsertPeople(): Promise<{ adminId: string; players: SeedPlayer[] }> {
  const [playerHash, adminHash] = await Promise.all([hash(PLAYER_PASSWORD, 10), hash(ADMIN_PASSWORD, 10)]);

  const admin = await prisma.user.upsert({
    where: { username: ADMIN_USERNAME },
    update: {},
    create: {
      username: ADMIN_USERNAME,
      email: "adminteste@teste.com",
      role: "ADMIN",
      passwordHash: adminHash,
      profile: {
        create: {
          name: "Admin Teste",
          completed: true,
          foot: pick(FEET),
          position: pick(OUTFIELD_POSITIONS),
          age: int(30, 45),
          heightCm: int(165, 190),
          weightKg: int(65, 90),
        },
      },
    },
  });

  const keeperSlots = new Set(shuffle([...Array(PLAYER_COUNT).keys()]).slice(0, KEEPER_COUNT));
  const unratedSlots = new Set(shuffle([...Array(PLAYER_COUNT).keys()]).slice(0, 3)); // sem estrela: exercita o "sem avaliacao"
  // 14 vulgos, cada um de um jeito so.
  const nicknames = shuffle(NICKNAMES);
  const nicknameByIndex = new Map(
    shuffle([...Array(PLAYER_COUNT).keys()])
      .slice(0, 14)
      .map((slot, order) => [slot, nicknames[order]] as const),
  );
  const names = new Set<string>();

  const players: SeedPlayer[] = [];
  for (let index = 0; index < PLAYER_COUNT; index += 1) {
    const number = String(index + 1).padStart(2, "0");
    let name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    while (names.has(name)) name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    names.add(name);

    const user = await prisma.user.upsert({
      where: { username: `rankingteste${number}` },
      update: {},
      create: {
        username: `rankingteste${number}`,
        email: `rankingteste${number}@teste.com`,
        role: "USER",
        passwordHash: playerHash,
        profile: {
          create: {
            name,
            nickname: nicknameByIndex.get(index) ?? null,
            completed: true,
            foot: pick(FEET),
            position: keeperSlots.has(index) ? "GOALKEEPER" : pick(OUTFIELD_POSITIONS),
            age: int(18, 40),
            heightCm: int(165, 195),
            weightKg: int(62, 95),
          },
        },
      },
      include: { profile: true },
    });

    // A estrela e sorteada a cada rodada da seed; o resto do perfil fica como nasceu.
    const stars = unratedSlots.has(index) ? null : randomStars();
    const profile = await prisma.playerProfile.update({
      where: { userId: user.id },
      data: {
        stars,
        starsUpdatedAt: stars === null ? null : new Date(Date.now() - int(2, 60) * 24 * 3600_000),
      },
    });

    players.push({
      userId: user.id,
      name: profile.name,
      stars,
      position: profile.position,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      skill: 1000 + 100 * ((stars ?? 3) - 3) + gauss() * (stars === null ? 100 : 60),
      presence: 0.4 + rand() * 0.6,
    });
  }
  return { adminId: admin.id, players };
}

type MatchPlan = {
  homeIndex: number;
  awayIndex: number;
  homeScore: number;
  awayScore: number;
  result: MatchResult;
  endReason: "GOALS" | "TIME";
  /** Gols em ordem: quem fez, quem assistiu (ou null) e em que instante da partida. */
  goals: { teamIndex: number; scorerId: string; assistId: string | null; elapsedMs: number }[];
};

/** Joga as partidas da noite pela fila de verdade: quem ganha fica, no empate saem os dois. */
function planMatches(teams: { players: SeedPlayer[] }[], goalsToWin: number, count: number): MatchPlan[] {
  const skillOf = new Map(teams.flatMap((team) => team.players.map((p) => [p.userId, p.skill] as const)));
  const ids = teams.map((_, index) => String(index));
  const plans: MatchPlan[] = [];
  let queue = ids.slice(2);
  let home = ids[0];
  let away = ids[1];

  for (let order = 0; order < count; order += 1) {
    const homeTeam = teams[Number(home)];
    const awayTeam = teams[Number(away)];
    const mean = (team: { players: SeedPlayer[] }) =>
      team.players.reduce((sum, p) => sum + (skillOf.get(p.userId) ?? 1000), 0) / team.players.length;
    // O mesmo Elo de escala 200 que o modelo assume, sobre o nivel de verdade.
    const matchWin = 1 / (1 + Math.pow(10, (mean(awayTeam) - mean(homeTeam)) / 200));
    const pGoal = goalProbability(matchWin, goalsToWin);

    // Uma em cada oito acaba por tempo, com no maximo 2 gols na partida.
    const byTime = rand() < 0.125;
    const goalCap = byTime ? int(0, 2) : Number.POSITIVE_INFINITY;
    let homeScore = 0;
    let awayScore = 0;
    const goals: MatchPlan["goals"] = [];
    while (homeScore < goalsToWin && awayScore < goalsToWin && homeScore + awayScore < goalCap) {
      const homeScores = rand() < pGoal;
      const side = homeScores ? homeTeam : awayTeam;
      const weights = side.players.map((p) => Math.exp(((skillOf.get(p.userId) ?? 1000) - 1000) / 250));
      const pickIndex = (skip = -1, w = weights) => {
        const total = w.reduce((sum, x, i) => (i === skip ? sum : sum + x), 0);
        let r = rand() * total;
        for (let i = 0; i < w.length; i += 1) {
          if (i === skip) continue;
          r -= w[i];
          if (r <= 0) return i;
        }
        return 0;
      };
      const scorer = pickIndex();
      const softer = side.players.map((p) => Math.exp(((skillOf.get(p.userId) ?? 1000) - 1000) / 500));
      const assist = rand() < 0.65 ? pickIndex(scorer, softer) : -1;
      goals.push({
        teamIndex: Number(homeScores ? home : away),
        scorerId: side.players[scorer].userId,
        assistId: assist === -1 ? null : side.players[assist].userId,
        elapsedMs: 0,
      });
      if (homeScores) homeScore += 1;
      else awayScore += 1;
    }

    const reachedGoals = homeScore >= goalsToWin || awayScore >= goalsToWin;
    const endedAt = reachedGoals ? int(120_000, 540_000) : MATCH_DURATION_MS;
    // Instantes crescentes dentro do tempo jogado.
    const instants = goals.map(() => int(20_000, Math.max(30_000, endedAt - 5_000))).sort((a, b) => a - b);
    goals.forEach((goal, i) => (goal.elapsedMs = i === goals.length - 1 && reachedGoals ? endedAt : instants[i]));

    const result: MatchResult = homeScore > awayScore ? "HOME" : homeScore < awayScore ? "AWAY" : "DRAW";
    plans.push({
      homeIndex: Number(home),
      awayIndex: Number(away),
      homeScore,
      awayScore,
      result,
      endReason: reachedGoals ? "GOALS" : "TIME",
      goals,
    });

    const rotation = rotateQueue({ homeTeamId: home, awayTeamId: away, result, queue });
    queue = rotation.queue;
    if (!rotation.nextHomeTeamId || !rotation.nextAwayTeamId) break;
    home = rotation.nextHomeTeamId;
    away = rotation.nextAwayTeamId;
  }
  return plans;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Seed de teste: nao roda em producao.");
  }
  console.log(`[teste:ranking-mmr] SEED=${SEED} (use SEED=${SEED} para repetir estes dados)`);

  const { adminId, players } = await upsertPeople();
  console.log(`[teste:ranking-mmr] admin ${ADMIN_USERNAME} + ${players.length} jogadores (rankingteste01 a ${String(PLAYER_COUNT).padStart(2, "0")})`);

  const removed = await prisma.gameDay.deleteMany({ where: { title: { startsWith: TITLE_PREFIX } } });
  if (removed.count > 0) console.log(`[teste:ranking-mmr] ${removed.count} peladas de uma rodada anterior apagadas`);

  // 10 semanas diferentes dentro das ultimas 13: as duas pontas ficam, tres do meio saem.
  const thursdays = recentThursdays(WEEKS_WINDOW);
  const skipped = new Set(shuffle([...Array(WEEKS_WINDOW - 2).keys()].map((i) => i + 1)).slice(0, WEEKS_WINDOW - GAME_DAY_COUNT));
  const dates = thursdays.filter((_, week) => !skipped.has(week)).reverse();

  const keepers = players.filter((p) => p.position === "GOALKEEPER");
  const outfield = players.filter((p) => p.position !== "GOALKEEPER");
  const location = "Quadra do Sesi (teste)";

  for (const [index, scheduledAt] of dates.entries()) {
    const title = `${TITLE_PREFIX}Pelada ${index + 1}/${GAME_DAY_COUNT}`;
    // 4 goleiros e 16 de linha; quem tem presenca maior aparece mais vezes.
    const squad = [
      ...weightedSample(keepers, (p) => p.presence, TEAM_COUNT),
      ...weightedSample(outfield, (p) => p.presence, TEAM_COUNT * (TEAM_SIZE - 1)),
    ];
    const balancerInput: BalancerPlayer[] = squad.map((p) => ({
      userId: p.userId,
      name: p.name,
      stars: p.stars,
      heightCm: p.heightCm,
      weightKg: p.weightKg,
      position: p.position,
    }));
    const balanced = balanceTeams(balancerInput, { teamSize: TEAM_SIZE, maxTeams: TEAM_COUNT, seed: int(1, 1_000_000_000) });
    const byId = new Map(players.map((p) => [p.userId, p]));
    const teams = balanced.teams.map((team) => ({ ...team, seedPlayers: team.players.map((p) => byId.get(p.userId)!) }));

    const goalsToWin = 2;
    const plans = planMatches(teams.map((t) => ({ players: t.seedPlayers })), goalsToWin, int(8, 11));
    const price = pick([450, 500, 600]);
    const finishedAt = new Date(scheduledAt.getTime() + 2.5 * 3600_000);

    await prisma.$transaction(
      async (tx) => {
        const gameDay = await tx.gameDay.create({
          data: {
            title,
            scheduledAt,
            location,
            pricePerPlayerCents: price,
            matchDurationSec: MATCH_DURATION_MS / 1000,
            goalsToWin,
            maxPlayers: TEAM_COUNT * TEAM_SIZE,
            teamSize: TEAM_SIZE,
            status: "FINISHED",
            finishedAt,
            createdById: adminId,
          },
        });

        for (const [position, player] of squad.entries()) {
          await tx.registration.create({
            data: {
              gameDayId: gameDay.id,
              userId: player.userId,
              paymentMethod: position % 3 === 0 ? "ON_SITE" : "PIX",
              paymentStatus: "CONFIRMED",
              confirmedById: adminId,
              confirmedAt: new Date(scheduledAt.getTime() - int(1, 40) * 3600_000),
              amountCents: price,
              createdAt: new Date(scheduledAt.getTime() - int(48, 120) * 3600_000),
            },
          });
        }

        const teamIds: string[] = [];
        for (const team of teams) {
          const created = await tx.team.create({
            data: {
              gameDayId: gameDay.id,
              name: team.name,
              colorToken: team.name.toLowerCase(),
              averageStrength: team.averageStrength,
              players: {
                create: team.players.map((p) => ({ userId: p.userId, isKeeper: p.isKeeper, strength: p.strength })),
              },
            },
          });
          teamIds.push(created.id);
        }

        for (const [order, plan] of plans.entries()) {
          const homeTeam = teams[plan.homeIndex];
          const awayTeam = teams[plan.awayIndex];
          const startedAt = new Date(scheduledAt.getTime() + order * 13 * 60_000);
          const playedMs = plan.endReason === "GOALS" ? Math.max(...plan.goals.map((g) => g.elapsedMs)) : MATCH_DURATION_MS;
          await tx.match.create({
            data: {
              gameDayId: gameDay.id,
              orderIndex: order + 1,
              homeTeamId: teamIds[plan.homeIndex],
              awayTeamId: teamIds[plan.awayIndex],
              homeScore: plan.homeScore,
              awayScore: plan.awayScore,
              status: "FINISHED",
              durationMs: MATCH_DURATION_MS,
              remainingMs: Math.max(0, MATCH_DURATION_MS - playedMs),
              startedAt,
              endedAt: new Date(startedAt.getTime() + playedMs),
              result: plan.result,
              endReason: plan.endReason,
              winnerTeamId: plan.result === "DRAW" ? null : teamIds[plan.result === "HOME" ? plan.homeIndex : plan.awayIndex],
              lineup: {
                create: [homeTeam, awayTeam].flatMap((team, side) =>
                  team.players.map((p) => ({
                    teamId: teamIds[side === 0 ? plan.homeIndex : plan.awayIndex],
                    userId: p.userId,
                    isKeeper: p.isKeeper,
                  })),
                ),
              },
              events: {
                create: plan.goals.flatMap((goal) => [
                  { teamId: teamIds[goal.teamIndex], userId: goal.scorerId, type: "GOAL" as const, elapsedMs: goal.elapsedMs, createdById: adminId },
                  ...(goal.assistId
                    ? [{ teamId: teamIds[goal.teamIndex], userId: goal.assistId, type: "ASSIST" as const, elapsedMs: goal.elapsedMs, createdById: adminId }]
                    : []),
                ]),
              },
            },
          });
        }
      },
      { timeout: 60_000, maxWait: 30_000 },
    );

    const totalGoals = plans.reduce((sum, plan) => sum + plan.homeScore + plan.awayScore, 0);
    const draws = plans.filter((plan) => plan.result === "DRAW").length;
    console.log(
      `[teste:ranking-mmr] ${title} (${scheduledAt.toLocaleDateString("pt-BR")}): ${squad.length} jogadores, ${plans.length} partidas, ${totalGoals} gols, ${draws} empates`,
    );
  }

  const outcome = await recomputeAllRatings(null);
  console.log(`[teste:ranking-mmr] MMR calculado: ${outcome.gameDays} peladas, ${outcome.players} jogadores`);

  const ratings = await prisma.playerRating.findMany({
    orderBy: [{ mmr: "desc" }, { userId: "asc" }],
    include: { user: { select: { username: true, profile: { select: { name: true, nickname: true, stars: true } } } } },
  });
  console.log("\n[teste:ranking-mmr] ranking geral (MMR):");
  for (const [position, rating] of ratings.entries()) {
    const profile = rating.user.profile;
    const label = `${profile?.nickname ? `${profile.name} (${profile.nickname})` : profile?.name}`.padEnd(34);
    const stars = profile?.stars == null ? "  - " : `${profile.stars.toFixed(1)}★`;
    console.log(
      `  ${String(position + 1).padStart(2)}. ${label} ${rating.mmr.toFixed(0).padStart(5)}  ${stars}  ${String(rating.gameDaysRated).padStart(2)} peladas  ${rating.user.username}`,
    );
  }

  console.log("\n[teste:ranking-mmr] credenciais:");
  console.log(`  admin    -> username: ${ADMIN_USERNAME} | senha: ${ADMIN_PASSWORD}`);
  console.log(`  jogador  -> username: rankingteste01 .. rankingteste${PLAYER_COUNT} | senha: ${PLAYER_PASSWORD}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("[teste:ranking-mmr] falhou", error);
    await prisma.$disconnect();
    process.exit(1);
  });
