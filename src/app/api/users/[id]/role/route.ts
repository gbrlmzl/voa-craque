import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { conflict, notFound, route } from "@/lib/http";
import { requireSuperadmin } from "@/lib/session";
import { roleSchema } from "@/lib/validation";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const superadmin = await requireSuperadmin();
    const { id } = await ctx.params;
    const { role } = roleSchema.parse(await req.json());

    const target = await prisma.user.findUnique({
      where: { id },
      include: { profile: { select: { name: true } } },
    });
    if (!target) throw notFound("Usuário não encontrado.");
    if (target.id === superadmin.id && role !== "SUPERADMIN") {
      throw conflict("Você não pode rebaixar a própria conta.");
    }

    await prisma.user.update({ where: { id }, data: { role } });

    await recordAudit(superadmin, {
      action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
      entity: "User",
      entityId: id,
      summary: `${target.profile?.name ?? target.username}: ${target.role} para ${role}`,
      before: { role: target.role },
      after: { role },
    });

    return { ok: true };
  });
}
