import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/http";
import { requireAdmin, requireUser } from "@/lib/session";
import { gameDaySchema } from "@/lib/validation";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  return route(async () => {
    await requireUser();
    const gameDays = await prisma.gameDay.findMany({
      orderBy: { scheduledAt: "desc" },
      include: { _count: { select: { registrations: true } } },
    });
    return { gameDays };
  });
}

export async function POST(req: NextRequest) {
  return route(async () => {
    const admin = await requireAdmin();
    const input = gameDaySchema.parse(await req.json());

    const gameDay = await prisma.gameDay.create({
      data: {
        title: input.title,
        scheduledAt: input.scheduledAt,
        location: input.location,
        pricePerPlayerCents: input.pricePerPlayerCents,
        matchDurationSec: input.matchDurationSec,
        goalsToWin: input.goalsToWin,
        maxPlayers: input.maxPlayers,
        teamSize: input.teamSize,
        pixKey: input.pixKey || null,
        notes: input.notes || null,
        createdById: admin.id,
      },
    });

    await recordAudit(admin, {
      action: AUDIT_ACTIONS.GAMEDAY_CREATED,
      entity: "GameDay",
      entityId: gameDay.id,
      summary: gameDay.title,
      after: gameDay,
    });

    return { id: gameDay.id };
  });
}
