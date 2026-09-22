import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { profileSchema } from "@/lib/validation";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** O jogador edita o proprio perfil. Estrelas e skills ficam fora: so o admin mexe. */
export async function PUT(req: NextRequest) {
  return route(async () => {
    const user = await requireUser();
    const input = profileSchema.parse(await req.json());

    const before = await prisma.playerProfile.findUnique({ where: { userId: user.id } });

    const data = {
      nickname: input.nickname || null,
      foot: input.foot,
      position: input.position,
      age: input.age,
      heightCm: input.heightCm,
      weightKg: input.weightKg,
      photoUrl: input.photoUrl || null,
      completed: true,
    };

    const profile = await prisma.playerProfile.upsert({
      where: { userId: user.id },
      update: data,
      create: { ...data, userId: user.id },
    });

    await recordAudit(user, {
      action: before?.completed ? AUDIT_ACTIONS.PROFILE_UPDATED : AUDIT_ACTIONS.PROFILE_COMPLETED,
      entity: "PlayerProfile",
      entityId: profile.id,
      summary: `Perfil de ${user.name}`,
      before: before ?? undefined,
      after: profile,
    });

    return { ok: true };
  });
}
