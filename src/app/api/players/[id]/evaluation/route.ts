import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, route } from "@/lib/http";
import { requireAdmin } from "@/lib/session";
import { skillsSchema, starsSchema } from "@/lib/validation";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const payloadSchema = starsSchema.merge(skillsSchema.partial()).extend({
  skillCodes: z.array(z.string()).optional(),
});

/** Estrelas e skills sao atribuidas pelo organizador, nunca pelo proprio jogador. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const input = payloadSchema.parse(await req.json());

    const profile = await prisma.playerProfile.findUnique({
      where: { userId: id },
      include: { skills: { include: { skill: true } } },
    });
    if (!profile) throw notFound("Este jogador ainda não preencheu o perfil.");

    const beforeSkills = profile.skills.map((entry) => entry.skill.code).sort();

    await prisma.playerProfile.update({ where: { id: profile.id }, data: { stars: input.stars } });

    if (input.skillCodes) {
      const skills = await prisma.skill.findMany({ where: { code: { in: input.skillCodes } } });
      if (skills.length !== input.skillCodes.length) {
        throw badRequest("Alguma skill enviada não existe na lista.");
      }

      await prisma.playerSkill.deleteMany({ where: { profileId: profile.id } });
      if (skills.length > 0) {
        await prisma.playerSkill.createMany({
          data: skills.map((skill) => ({
            profileId: profile.id,
            skillId: skill.id,
            assignedById: admin.id,
          })),
        });
      }

      await recordAudit(admin, {
        action: AUDIT_ACTIONS.PLAYER_SKILLS_SET,
        entity: "PlayerProfile",
        entityId: profile.id,
        summary: `Skills de ${profile.name}`,
        before: { skills: beforeSkills },
        after: { skills: input.skillCodes.slice().sort() },
      });
    }

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
