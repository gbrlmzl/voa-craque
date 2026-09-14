import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/http";
import { requireSuperadmin } from "@/lib/session";
import { systemSettingsSchema } from "@/lib/validation";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Liga e desliga o acesso publico ao site. O superadmin continua entrando. */
export async function PATCH(req: NextRequest) {
  return route(async () => {
    const superadmin = await requireSuperadmin();
    const input = systemSettingsSchema.parse(await req.json());

    const before = await prisma.systemSetting.findUnique({ where: { id: "global" } });
    const settings = await prisma.systemSetting.upsert({
      where: { id: "global" },
      update: { ...input, updatedById: superadmin.id },
      create: { id: "global", ...input, updatedById: superadmin.id },
    });

    await recordAudit(superadmin, {
      action: AUDIT_ACTIONS.SYSTEM_SETTINGS_UPDATED,
      entity: "SystemSetting",
      entityId: "global",
      summary: input.publicAccessEnabled ? "Site liberado" : "Site em manutenção",
      before: before ?? undefined,
      after: settings,
    });

    return { ok: true };
  });
}
