import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, route } from "@/lib/http";
import { requireAdmin } from "@/lib/session";
import { paymentDecisionSchema } from "@/lib/validation";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { publishGameDay } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const ACTION_BY_STATUS = {
  CONFIRMED: AUDIT_ACTIONS.PAYMENT_CONFIRMED,
  REJECTED: AUDIT_ACTIONS.PAYMENT_REJECTED,
  PENDING: AUDIT_ACTIONS.PAYMENT_RESET,
} as const;

/** Confirmacao manual do pagamento. Nao ha integracao com banco: o admin decide. */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; registrationId: string }> },
) {
  return route(async () => {
    const admin = await requireAdmin();
    const { id, registrationId } = await ctx.params;
    const input = paymentDecisionSchema.parse(await req.json());

    const before = await prisma.registration.findUnique({
      where: { id: registrationId },
      include: { user: { select: { username: true, profile: { select: { name: true } } } } },
    });
    if (!before || before.gameDayId !== id) throw notFound("Inscrição não encontrada.");
    if (input.paymentStatus === "REJECTED" && !input.rejectedReason) {
      throw badRequest("Diga o motivo da recusa.");
    }

    const registration = await prisma.registration.update({
      where: { id: registrationId },
      data: {
        paymentStatus: input.paymentStatus,
        rejectedReason: input.paymentStatus === "REJECTED" ? input.rejectedReason || null : null,
        confirmedById: input.paymentStatus === "CONFIRMED" ? admin.id : null,
        confirmedAt: input.paymentStatus === "CONFIRMED" ? new Date() : null,
      },
    });

    await recordAudit(admin, {
      action: ACTION_BY_STATUS[input.paymentStatus],
      entity: "Registration",
      entityId: registrationId,
      summary: `Pagamento de ${before.user.profile?.name ?? before.user.username}`,
      before: { paymentStatus: before.paymentStatus },
      after: { paymentStatus: registration.paymentStatus, rejectedReason: registration.rejectedReason },
    });
    publishGameDay(id, "payment-updated");

    return { ok: true };
  });
}
