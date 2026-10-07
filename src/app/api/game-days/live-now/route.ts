import { route } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import type { LiveNow } from "@/lib/live-now";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Qual pelada esta ao vivo agora, para o atalho flutuante. Uma consulta so e
 * sem buildLiveSnapshot: aquele sincroniza o relogio e grava no banco, e este
 * endpoint e chamado a cada 15s por cada organizador com o app aberto.
 *
 * Segmento estatico, entao tem prioridade sobre [id] no App Router. Vale para
 * todo organizador (qualquer um pode abrir o painel); com mais de uma pelada
 * LIVE (raro), a mais recente.
 */
export async function GET() {
  return route(async (): Promise<{ live: LiveNow | null }> => {
    await requireAdmin();

    const gameDay = await prisma.gameDay.findFirst({
      where: { status: "LIVE" },
      orderBy: { scheduledAt: "desc" },
      select: {
        id: true,
        title: true,
        matches: {
          where: { status: { not: "FINISHED" } },
          orderBy: { orderIndex: "asc" },
          take: 1,
          select: {
            id: true,
            orderIndex: true,
            status: true,
            homeScore: true,
            awayScore: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        },
      },
    });
    if (!gameDay) return { live: null };

    const match = gameDay.matches[0];
    return {
      live: {
        gameDayId: gameDay.id,
        title: gameDay.title,
        match:
          match && match.status !== "FINISHED"
            ? {
                id: match.id,
                orderIndex: match.orderIndex,
                status: match.status,
                homeName: match.homeTeam.name,
                awayName: match.awayTeam.name,
                homeScore: match.homeScore,
                awayScore: match.awayScore,
              }
            : null,
      },
    };
  });
}
