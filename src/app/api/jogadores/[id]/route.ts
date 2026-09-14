import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { notFound, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { COURSE_LABEL, FOOT_LABEL, POSITION_LABEL } from "@/lib/labels";

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
        name: true,
        profile: {
          select: {
            nickname: true,
            photoUrl: true,
            position: true,
            foot: true,
            age: true,
            heightCm: true,
            weightKg: true,
            course: true,
            courseName: true,
            stars: true,
            skills: { include: { skill: true } },
          },
        },
      },
    });

    if (!user?.profile) throw notFound("Este jogador ainda não preencheu o perfil.");

    const [events, memberships] = await Promise.all([
      prisma.matchEvent.groupBy({
        by: ["type"],
        where: { userId: id, match: { status: "FINISHED" } },
        _count: { _all: true },
      }),
      prisma.teamPlayer.findMany({
        where: { userId: id },
        select: {
          teamId: true,
          team: {
            select: {
              homeMatches: { where: { status: "FINISHED" }, select: { result: true } },
              awayMatches: { where: { status: "FINISHED" }, select: { result: true } },
            },
          },
        },
      }),
    ]);

    let played = 0;
    let won = 0;
    for (const membership of memberships) {
      for (const match of membership.team.homeMatches) {
        played += 1;
        if (match.result === "HOME") won += 1;
      }
      for (const match of membership.team.awayMatches) {
        played += 1;
        if (match.result === "AWAY") won += 1;
      }
    }

    const profile = user.profile;
    return {
      userId: user.id,
      name: user.name,
      nickname: profile.nickname,
      photoUrl: profile.photoUrl,
      position: profile.position,
      positionLabel: POSITION_LABEL[profile.position],
      footLabel: FOOT_LABEL[profile.foot],
      age: profile.age,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      courseLabel: profile.course === "OTHER" ? profile.courseName || "Outro" : COURSE_LABEL[profile.course],
      stars: profile.stars,
      skills: profile.skills.map((entry) => ({
        code: entry.skill.code,
        label: entry.skill.label,
        polarity: entry.skill.polarity,
      })),
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
