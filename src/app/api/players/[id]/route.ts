import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { notFound, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { FOOT_LABEL, POSITION_LABEL } from "@/lib/labels";
import { mmrRankOf } from "@/services/ranking";

export const dynamic = "force-dynamic";

/** Ficha publica do jogador para o modal. Nunca devolve e-mail nem papel. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    await requireUser();
    const { id } = await ctx.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        profile: {
          select: {
            name: true,
            nickname: true,
            photoUrl: true,
            position: true,
            foot: true,
            age: true,
            heightCm: true,
            weightKg: true,
            stars: true,
          },
        },
      },
    });

    if (!user?.profile) throw notFound("Este jogador ainda não preencheu o perfil.");

    const [events, lineups, ratingRow] = await Promise.all([
      prisma.matchEvent.groupBy({
        by: ["type"],
        where: { userId: id, match: { status: "FINISHED" } },
        _count: { _all: true },
      }),
      prisma.matchPlayer.findMany({
        where: { userId: id, match: { status: "FINISHED" } },
        select: { teamId: true, match: { select: { result: true, homeTeamId: true } } },
      }),
      prisma.playerRating.findUnique({ where: { userId: id } }),
    ]);

    // So aparece depois da primeira pelada contabilizada: antes disso o jogador nem tem posicao.
    let rating: unknown = null;
    if (ratingRow && ratingRow.gameDaysRated > 0) {
      const [rank, changes] = await Promise.all([
        mmrRankOf(id),
        prisma.ratingChange.findMany({
          where: { userId: id },
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { gameDay: { select: { id: true, title: true, scheduledAt: true } } },
        }),
      ]);
      // Fora do ranking (conta inativa) nao ha posicao para mostrar.
      if (rank !== null) rating = {
        rank,
        gameDays: ratingRow.gameDaysRated,
        mmr: ratingRow.mmr,
        peak: ratingRow.peakMmr,
        history: changes.map((change) => ({
          gameDayId: change.gameDay.id,
          gameDayTitle: change.gameDay.title,
          date: change.gameDay.scheduledAt.toISOString(),
          delta: change.delta,
          mmrAfter: change.mmrAfter,
          resultDelta: change.resultDelta,
          attackDelta: change.attackDelta,
          defenseDelta: change.defenseDelta,
          normalizeDelta: change.normalizeDelta,
          stakeFactor: change.stakeFactor,
          starsUsed: change.starsUsed,
          capped: change.capped,
          goals: change.goals,
          assists: change.assists,
          matches: change.matches,
        })),
      };
    }

    // Cada linha e uma partida que ele jogou, pelo time de que fez parte nela.
    const played = lineups.length;
    const won = lineups.filter(
      ({ teamId, match }) => match.result === (teamId === match.homeTeamId ? "HOME" : "AWAY"),
    ).length;

    const profile = user.profile;
    return {
      userId: user.id,
      name: profile.name,
      nickname: profile.nickname,
      photoUrl: profile.photoUrl,
      position: profile.position,
      positionLabel: POSITION_LABEL[profile.position],
      footLabel: FOOT_LABEL[profile.foot],
      age: profile.age,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      stars: profile.stars,
      rating,
      stats: {
        goals: events.find((entry) => entry.type === "GOAL")?._count._all ?? 0,
        assists: events.find((entry) => entry.type === "ASSIST")?._count._all ?? 0,
        played,
        won,
        winRate: played > 0 ? won / played : 0,
      },
    };
  });
}
