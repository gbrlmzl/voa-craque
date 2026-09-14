import type { PaymentMethod, PaymentStatus, Position } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, conflict, notFound } from "@/lib/http";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { publishGameDay } from "@/lib/realtime";
import type { CurrentUser } from "@/lib/session";
import { balanceTeams, ratePlayers, TEAM_NAMES, type BalancerPlayer } from "@/lib/team-balancer";
import type { ManualTeamsInput } from "@/lib/validation";
import { ensureOpeningMatch } from "@/services/match";

export type PoolPlayer = BalancerPlayer & {
  nickname: string | null;
  photoUrl: string | null;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
};

/**
 * Quem entra no sorteio: todo inscrito cujo pagamento nao foi recusado.
 * Quem vai pagar no local ainda esta pendente na hora de montar os times.
 */
export async function loadPool(gameDayId: string): Promise<PoolPlayer[]> {
  const registrations = await prisma.registration.findMany({
    where: { gameDayId, paymentStatus: { not: "REJECTED" } },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          profile: {
            select: {
              nickname: true,
              photoUrl: true,
              stars: true,
              heightCm: true,
              weightKg: true,
              position: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return registrations.map((registration) => ({
    userId: registration.user.id,
    name: registration.user.name,
    nickname: registration.user.profile?.nickname ?? null,
    photoUrl: registration.user.profile?.photoUrl ?? null,
    stars: registration.user.profile?.stars ?? null,
    heightCm: registration.user.profile?.heightCm ?? null,
    weightKg: registration.user.profile?.weightKg ?? null,
    position: (registration.user.profile?.position as Position | undefined) ?? null,
    paymentStatus: registration.paymentStatus,
    paymentMethod: registration.paymentMethod,
  }));
}

async function assertTeamsEditable(gameDayId: string) {
  const gameDay = await prisma.gameDay.findUnique({ where: { id: gameDayId } });
  if (!gameDay) throw notFound("Pelada não encontrada.");
  if (gameDay.status === "FINISHED") throw conflict("A pelada já foi encerrada.");

  const started = await prisma.match.findFirst({
    where: { gameDayId, status: { not: "SCHEDULED" } },
    select: { id: true },
  });
  if (started) {
    throw conflict("A pelada já começou. Não dá para remontar os times agora.");
  }
  return gameDay;
}

async function clearTeams(gameDayId: string) {
  await prisma.match.deleteMany({ where: { gameDayId } });
  await prisma.gameDayReserve.deleteMany({ where: { gameDayId } });
  await prisma.team.deleteMany({ where: { gameDayId } });
}

export type DrawSummary = {
  teams: { name: string; averageStrength: number; players: string[] }[];
  reserves: string[];
  unratedCount: number;
  spread: number;
};

export async function drawTeams(
  gameDayId: string,
  actor: CurrentUser,
  seed?: number,
): Promise<DrawSummary> {
  const gameDay = await assertTeamsEditable(gameDayId);
  const pool = await loadPool(gameDayId);

  const result = balanceTeams(pool, {
    teamSize: gameDay.teamSize,
    seed: seed ?? Math.floor(Math.random() * 1_000_000),
  });

  await clearTeams(gameDayId);

  for (const team of result.teams) {
    await prisma.team.create({
      data: {
        gameDayId,
        name: team.name,
        colorToken: team.name.toLowerCase(),
        averageStrength: team.averageStrength,
        queuePosition: team.index < 2 ? null : team.index - 2,
        players: {
          create: team.players.map((player) => ({
            userId: player.userId,
            isKeeper: player.isKeeper,
            strength: player.strength,
          })),
        },
      },
    });
  }

  if (result.reserves.length > 0) {
    await prisma.gameDayReserve.createMany({
      data: result.reserves.map((player) => ({ gameDayId, userId: player.userId })),
    });
  }

  await prisma.gameDay.update({ where: { id: gameDayId }, data: { status: "TEAMS_SET" } });
  await ensureOpeningMatch(gameDayId);

  const summary: DrawSummary = {
    teams: result.teams.map((team) => ({
      name: team.name,
      averageStrength: team.averageStrength,
      players: team.players.map((player) => player.name),
    })),
    reserves: result.reserves.map((player) => player.name),
    unratedCount: result.unratedCount,
    spread: result.spread,
  };

  await recordAudit(actor, {
    action: AUDIT_ACTIONS.TEAMS_DRAWN,
    entity: "GameDay",
    entityId: gameDayId,
    summary: `${result.teams.length} times sorteados, ${result.reserves.length} reservas`,
    after: summary,
  });
  publishGameDay(gameDayId, "teams-drawn");

  return summary;
}

export async function setTeamsManually(
  gameDayId: string,
  actor: CurrentUser,
  input: ManualTeamsInput,
): Promise<void> {
  const gameDay = await assertTeamsEditable(gameDayId);
  const pool = await loadPool(gameDayId);
  const byId = new Map(pool.map((player) => [player.userId, player]));

  const assigned = input.teams.flatMap((team) => team.playerIds);
  const seen = new Set<string>();
  for (const id of [...assigned, ...input.reserveIds]) {
    if (!byId.has(id)) throw badRequest("Há jogador fora da lista de inscritos da pelada.");
    if (seen.has(id)) throw badRequest("O mesmo jogador foi colocado em dois lugares.");
    seen.add(id);
  }

  const filled = input.teams.filter((team) => team.playerIds.length > 0);
  if (filled.length < 2) throw badRequest("Monte pelo menos dois times com jogadores.");
  for (const team of filled) {
    if (team.playerIds.length > gameDay.teamSize) {
      throw badRequest(`O time ${team.name} tem mais que ${gameDay.teamSize} jogadores.`);
    }
  }

  const { rated } = ratePlayers(pool);
  const strengthById = new Map(rated.map((player) => [player.userId, player]));

  await clearTeams(gameDayId);

  for (const [index, team] of filled.entries()) {
    const players = team.playerIds.map((id) => strengthById.get(id)!);
    const total = players.reduce((sum, player) => sum + player.strength, 0);

    await prisma.team.create({
      data: {
        gameDayId,
        name: TEAM_NAMES[index] ?? team.name,
        colorToken: (TEAM_NAMES[index] ?? team.name).toLowerCase(),
        averageStrength: players.length ? Math.round((total / players.length) * 100) / 100 : 0,
        queuePosition: index < 2 ? null : index - 2,
        players: {
          create: players.map((player) => ({
            userId: player.userId,
            isKeeper: player.isKeeper,
            strength: player.strength,
          })),
        },
      },
    });
  }

  const reserveIds = input.reserveIds.filter((id) => !assigned.includes(id));
  if (reserveIds.length > 0) {
    await prisma.gameDayReserve.createMany({
      data: reserveIds.map((userId) => ({ gameDayId, userId })),
    });
  }

  await prisma.gameDay.update({ where: { id: gameDayId }, data: { status: "TEAMS_SET" } });
  await ensureOpeningMatch(gameDayId);

  await recordAudit(actor, {
    action: AUDIT_ACTIONS.TEAMS_SET_MANUALLY,
    entity: "GameDay",
    entityId: gameDayId,
    summary: `${filled.length} times montados na mão, ${reserveIds.length} reservas`,
    after: {
      teams: filled.map((team, index) => ({
        name: TEAM_NAMES[index] ?? team.name,
        players: team.playerIds.map((id) => byId.get(id)?.name ?? id),
      })),
      reserves: reserveIds.map((id) => byId.get(id)?.name ?? id),
    },
  });
  publishGameDay(gameDayId, "teams-set");
}
