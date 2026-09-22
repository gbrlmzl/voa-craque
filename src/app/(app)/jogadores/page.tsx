import { prisma } from "@/lib/prisma";
import { pageAdmin } from "@/lib/session";
import { POSITION_LABEL } from "@/lib/labels";
import { PlayerEvaluation, type EvaluationPlayer, type SkillOption } from "@/components/PlayerEvaluation";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  await pageAdmin();

  const [users, skills] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, profile: { isNot: null } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        profile: {
          select: {
            nickname: true,
            photoUrl: true,
            position: true,
            stars: true,
            skills: { select: { skill: { select: { code: true } } } },
          },
        },
      },
    }),
    prisma.skill.findMany({ orderBy: [{ polarity: "asc" }, { label: "asc" }] }),
  ]);

  const players: EvaluationPlayer[] = users
    .filter((user) => user.profile)
    .map((user) => ({
      userId: user.id,
      name: user.name,
      nickname: user.profile!.nickname,
      photoUrl: user.profile!.photoUrl,
      positionLabel: POSITION_LABEL[user.profile!.position],
      stars: user.profile!.stars,
      skillCodes: user.profile!.skills.map((entry) => entry.skill.code),
    }));

  const options: SkillOption[] = skills.map((skill) => ({
    code: skill.code,
    label: skill.label,
    polarity: skill.polarity,
  }));

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Avaliar jogadores</h1>
        <p className="mt-1 text-sm text-slate-400">
          As estrelas alimentam o sorteio de times. As skills são só para zoar com carinho.
        </p>
      </div>

      <PlayerEvaluation players={players} skills={options} />
    </div>
  );
}
