import { prisma } from "@/lib/prisma";
import { pageAdmin } from "@/lib/session";
import { POSITION_LABEL } from "@/lib/labels";
import { PlayerEvaluation, type EvaluationPlayer } from "@/components/PlayerEvaluation";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  await pageAdmin();

  const users = await prisma.user.findMany({
    where: { active: true, profile: { isNot: null } },
    orderBy: { profile: { name: "asc" } },
    select: {
      id: true,
      username: true,
      profile: {
        select: {
          name: true,
          nickname: true,
          photoUrl: true,
          position: true,
          stars: true,
        },
      },
    },
  });

  const players: EvaluationPlayer[] = users
    .filter((user) => user.profile)
    .map((user) => ({
      userId: user.id,
      name: user.profile!.name,
      nickname: user.profile!.nickname,
      photoUrl: user.profile!.photoUrl,
      positionLabel: POSITION_LABEL[user.profile!.position],
      stars: user.profile!.stars,
    }));

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Avaliar jogadores</h1>
        <p className="mt-1 text-sm text-slate-400">As estrelas alimentam o sorteio de times.</p>
      </div>

      <PlayerEvaluation players={players} />
    </div>
  );
}
