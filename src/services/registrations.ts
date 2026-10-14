import type { PaymentMethod } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, conflict, notFound } from "@/lib/http";
import { checkAdminRegistration, checkAdminRemoval } from "@/lib/admin-registration";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { POSITION_LABEL } from "@/lib/labels";
import { publishGameDay, withLock } from "@/lib/realtime";
import type { CurrentUser } from "@/lib/session";

export type RegistrationCandidate = {
  userId: string;
  name: string;
  nickname: string | null;
  photoUrl: string | null;
  positionLabel: string;
  stars: number | null;
  profileCompleted: boolean;
};

function playerName(user: { username: string; profile: { name: string } | null }): string {
  return user.profile?.name ?? user.username;
}

export async function listRegistrationCandidates(gameDayId: string): Promise<RegistrationCandidate[]> {
  const gameDay = await prisma.gameDay.findUnique({ where: { id: gameDayId }, select: { id: true } });
  if (!gameDay) throw notFound("Pelada não encontrada.");

  const users = await prisma.user.findMany({
    where: {
      active: true,
      registrations: { none: { gameDayId } },
    },
    select: {
      id: true,
      username: true,
      profile: {
        select: {
          name: true,
          nickname: true,
          photoUrl: true,
          position: true,
          stars: true,
          completed: true,
        },
      },
    },
  });

  return users
    .map((user) => ({
      userId: user.id,
      name: playerName(user),
      nickname: user.profile?.nickname ?? null,
      photoUrl: user.profile?.photoUrl ?? null,
      positionLabel: user.profile?.position ? POSITION_LABEL[user.profile.position] : "Sem posição",
      stars: user.profile?.stars ?? null,
      profileCompleted: user.profile?.completed ?? false,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export type AdminRegistrationInput = {
  userIds: string[];
  paymentMethod: PaymentMethod;
  alreadyPaid: boolean;
};

export async function registerPlayersByAdmin(
  gameDayId: string,
  actor: CurrentUser,
  input: AdminRegistrationInput,
) {
  return withLock(`clock:${gameDayId}`, async () => {
    const userIds = [...new Set(input.userIds)];
    const gameDay = await prisma.gameDay.findUnique({
      where: { id: gameDayId },
      include: {
        _count: { select: { registrations: true } },
        matches: { where: { status: { not: "SCHEDULED" } }, select: { id: true }, take: 1 },
      },
    });
    if (!gameDay) throw notFound("Pelada não encontrada.");

    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, active: true },
      select: {
        id: true,
        username: true,
        profile: {
          select: {
            name: true,
            nickname: true,
            photoUrl: true,
            position: true,
            stars: true,
            completed: true,
          },
        },
      },
    });
    if (users.length !== userIds.length) {
      throw badRequest("Há jogador que não pode ser inscrito: conta desativada ou perfil incompleto.");
    }

    const existing = await prisma.registration.findMany({
      where: { gameDayId, userId: { in: userIds } },
      include: { user: { select: { username: true, profile: { select: { name: true } } } } },
    });
    if (existing.length > 0) {
      const names = existing.map((row) => playerName(row.user));
      const suffix = names.length > 1 ? ` e mais ${names.length - 1}` : "";
      throw conflict(`${names[0]} já está inscrito nesta pelada${suffix}.`);
    }

    const check = checkAdminRegistration({
      status: gameDay.status,
      matchStarted: gameDay.matches.length > 0,
      registeredCount: gameDay._count.registrations,
      maxPlayers: gameDay.maxPlayers,
      selectedCount: userIds.length,
    });
    if (!check.ok) throw conflict(check.error);

    const created = await prisma.$transaction(async (tx) => {
      const count = await tx.registration.count({ where: { gameDayId } });
      const lockedCheck = checkAdminRegistration({
        status: gameDay.status,
        matchStarted: gameDay.matches.length > 0,
        registeredCount: count,
        maxPlayers: gameDay.maxPlayers,
        selectedCount: userIds.length,
      });
      if (!lockedCheck.ok) throw conflict(lockedCheck.error);

      const now = new Date();
      const registrations = [];
      for (const user of users) {
        registrations.push(
          await tx.registration.create({
            data: {
              gameDayId,
              userId: user.id,
              paymentMethod: input.paymentMethod,
              amountCents: gameDay.pricePerPlayerCents,
              paymentStatus: input.alreadyPaid ? "CONFIRMED" : "PENDING",
              confirmedById: input.alreadyPaid ? actor.id : null,
              confirmedAt: input.alreadyPaid ? now : null,
            },
          }),
        );
      }
      if (lockedCheck.asReserve) {
        await tx.gameDayReserve.createMany({
          data: userIds.map((userId) => ({ gameDayId, userId })),
          skipDuplicates: true,
        });
      }
      return { registrations, asReserve: lockedCheck.asReserve };
    });

    for (const registration of created.registrations) {
      const user = users.find((candidate) => candidate.id === registration.userId)!;
      await recordAudit(actor, {
        action: AUDIT_ACTIONS.REGISTRATION_ADDED_BY_ADMIN,
        entity: "Registration",
        entityId: registration.id,
        summary: `${actor.name ?? actor.username} inscreveu ${playerName(user)} em ${gameDay.title}`,
        after: { ...registration, asReserve: created.asReserve },
      });
    }
    publishGameDay(gameDayId, "registration-created");

    return {
      asReserve: created.asReserve,
      created: created.registrations.map((registration) => ({
        registrationId: registration.id,
        userId: registration.userId,
        name: playerName(users.find((user) => user.id === registration.userId)!),
      })),
    };
  });
}

export async function removeRegistrationByAdmin(
  gameDayId: string,
  registrationId: string,
  actor: CurrentUser,
): Promise<void> {
  return withLock(`clock:${gameDayId}`, async () => {
    const registration = await prisma.registration.findUnique({
      where: { id: registrationId },
      include: {
        gameDay: { select: { id: true, title: true, status: true } },
        user: { select: { id: true, username: true, profile: { select: { name: true } } } },
      },
    });
    if (!registration || registration.gameDayId !== gameDayId) {
      throw notFound("Inscrição não encontrada.");
    }

    const [inTeam, hasPlayed] = await Promise.all([
      prisma.teamPlayer.findFirst({ where: { userId: registration.userId, team: { gameDayId } }, select: { id: true } }),
      prisma.matchPlayer.findFirst({ where: { userId: registration.userId, match: { gameDayId } }, select: { id: true } }),
    ]);
    const name = playerName(registration.user);
    const check = checkAdminRemoval({
      status: registration.gameDay.status,
      playerName: name,
      inTeam: !!inTeam,
      hasPlayed: !!hasPlayed,
    });
    if (!check.ok) throw conflict(check.error);

    await prisma.$transaction([
      prisma.registration.delete({ where: { id: registrationId } }),
      prisma.gameDayReserve.deleteMany({ where: { gameDayId, userId: registration.userId } }),
    ]);

    await recordAudit(actor, {
      action: AUDIT_ACTIONS.REGISTRATION_REMOVED_BY_ADMIN,
      entity: "Registration",
      entityId: registrationId,
      summary: `${actor.name ?? actor.username} removeu ${name} de ${registration.gameDay.title}`,
      before: registration,
    });
    publishGameDay(gameDayId, "registration-removed");
  });
}
