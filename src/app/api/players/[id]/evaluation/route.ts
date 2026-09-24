import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { notFound, route } from "@/lib/http";
import { requireAdmin } from "@/lib/session";
import { starsSchema } from "@/lib/validation";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Estrelas sao atribuidas pelo organizador, nunca pelo proprio jogador. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const input = starsSchema.parse(await req.json());

    const profile = await prisma.playerProfile.findUnique({ where: { userId: id } });
    if (!profile) throw notFound("Este jogador ainda não preencheu o perfil.");

    await prisma.playerProfile.update({ where: { id: profile.id }, data: { stars: input.stars } });

    if (profile.stars !== input.stars) {
      await recordAudit(admin, {
        action: AUDIT_ACTIONS.PLAYER_STARS_SET,
        entity: "PlayerProfile",
        entityId: profile.id,
        summary: `Estrelas de ${profile.name}`,
        before: { stars: profile.stars },
        after: { stars: input.stars },
      });
    }

    return { ok: true };
  });
}
