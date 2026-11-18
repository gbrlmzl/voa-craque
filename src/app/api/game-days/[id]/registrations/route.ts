import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, conflict, notFound, route } from "@/lib/http";
import { getSystemSettings, requireUser } from "@/lib/session";
import { registrationSchema } from "@/lib/validation";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { publishGameDay } from "@/lib/realtime";
import { PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { checkPaymentMethodChange } from "@/lib/payment-method";

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

/**
 * O jogador troca a propria forma de pagamento (PIX <-> no local). A regra de quando
 * pode esta em checkPaymentMethodChange. A inscricao volta para "aguardando": o
 * comprovante e o motivo de recusa antigos nao valem para a forma nova.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const input = registrationSchema.parse(await req.json());

    const registration = await prisma.registration.findUnique({
      where: { gameDayId_userId: { gameDayId: id, userId: user.id } },
      include: { gameDay: { select: { status: true, title: true } } },
    });
    if (!registration) throw notFound("Você não está inscrito nesta pelada.");
    if (registration.gameDay.status === "FINISHED") throw conflict("Esta pelada já foi encerrada.");
    if (registration.gameDay.status === "CANCELED") throw conflict("Esta pelada foi cancelada.");

    const check = checkPaymentMethodChange(registration);
    if (!check.ok) throw conflict(check.error);
    if (input.paymentMethod === registration.paymentMethod) {
      throw conflict("Você já está com essa forma de pagamento.");
    }
    if (input.paymentMethod === "PIX" && !input.receiptUrl) {
      throw badRequest("Anexe o comprovante do PIX.");
    }

    // Condicionado ao estado lido acima: se o organizador confirmou ou recusou no meio
    // do caminho, nada e alterado em vez de passar por cima da decisao dele.
    const updated = await prisma.registration.updateMany({
      where: {
        id: registration.id,
        paymentMethod: registration.paymentMethod,
        paymentStatus: registration.paymentStatus,
        receiptUrl: registration.receiptUrl,
      },
      data: {
        paymentMethod: input.paymentMethod,
        paymentStatus: "PENDING",
        receiptUrl: input.paymentMethod === "PIX" ? input.receiptUrl || null : null,
        rejectedReason: null,
        confirmedById: null,
        confirmedAt: null,
      },
    });
    if (updated.count === 0) {
      throw conflict("O organizador acabou de atualizar o seu pagamento. Atualize a página e tente de novo.");
    }
    const after = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } });

    await recordAudit(user, {
      action: AUDIT_ACTIONS.REGISTRATION_PAYMENT_METHOD_CHANGED,
      entity: "Registration",
      entityId: registration.id,
      summary: `${user.name ?? user.username} trocou o pagamento de ${PAYMENT_METHOD_LABEL[registration.paymentMethod]} para ${PAYMENT_METHOD_LABEL[after.paymentMethod]} em ${registration.gameDay.title}`,
      before: {
        paymentMethod: registration.paymentMethod,
        paymentStatus: registration.paymentStatus,
        receiptUrl: registration.receiptUrl,
        rejectedReason: registration.rejectedReason,
      },
      after: {
        paymentMethod: after.paymentMethod,
        paymentStatus: after.paymentStatus,
        receiptUrl: after.receiptUrl,
        rejectedReason: after.rejectedReason,
      },
    });
    publishGameDay(id, "payment-method-changed");

    return { ok: true };
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
