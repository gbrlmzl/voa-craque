import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, conflict, notFound, route } from "@/lib/http";
import { getSystemSettings, requireUser } from "@/lib/session";
import { registrationSchema } from "@/lib/validation";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { publishGameDay } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const input = registrationSchema.parse(await req.json());

    const settings = await getSystemSettings();
    if (!settings.registrationOpen) throw conflict("As inscrições estão fechadas no momento.");

    const gameDay = await prisma.gameDay.findUnique({
      where: { id },
      include: { _count: { select: { registrations: true } } },
    });
    if (!gameDay) throw notFound("Pelada não encontrada.");
    if (gameDay.status !== "OPEN") throw conflict("As inscrições desta pelada já foram encerradas.");

    const existing = await prisma.registration.findUnique({
      where: { gameDayId_userId: { gameDayId: id, userId: user.id } },
    });
    if (existing) throw conflict("Você já está inscrito nesta pelada.");
    if (gameDay._count.registrations >= gameDay.maxPlayers) {
      throw conflict("A pelada já está lotada.");
    }
    if (input.paymentMethod === "PIX" && !input.receiptUrl) {
      throw badRequest("Anexe o comprovante do PIX.");
    }

    const registration = await prisma.registration.create({
      data: {
        gameDayId: id,
        userId: user.id,
        paymentMethod: input.paymentMethod,
        receiptUrl: input.receiptUrl || null,
        amountCents: gameDay.pricePerPlayerCents,
      },
    });

    await recordAudit(user, {
      action: AUDIT_ACTIONS.REGISTRATION_CREATED,
      entity: "Registration",
      entityId: registration.id,
      summary: `${user.name ?? user.username} se inscreveu em ${gameDay.title}`,
      after: registration,
    });
    publishGameDay(id, "registration-created");

    return { id: registration.id };
  });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;

    const registration = await prisma.registration.findUnique({
      where: { gameDayId_userId: { gameDayId: id, userId: user.id } },
      include: { gameDay: { select: { status: true, title: true } } },
    });
    if (!registration) throw notFound("Você não está inscrito nesta pelada.");
    if (registration.gameDay.status !== "OPEN") {
      throw conflict("Os times já foram montados. Fale com o organizador.");
    }

    await prisma.registration.delete({ where: { id: registration.id } });

    await recordAudit(user, {
      action: AUDIT_ACTIONS.REGISTRATION_CANCELLED,
      entity: "Registration",
      entityId: registration.id,
      summary: `${user.name ?? user.username} saiu de ${registration.gameDay.title}`,
      before: registration,
    });
    publishGameDay(id, "registration-cancelled");

    return { ok: true };
  });
}
