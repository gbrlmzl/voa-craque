import { prisma } from "@/lib/prisma";
import { pageAdmin } from "@/lib/session";
import { POSITION_LABEL } from "@/lib/labels";
import { PlayerEvaluation, type EvaluationPlayer } from "@/components/PlayerEvaluation";
import { mmrRanks } from "@/services/ranking";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  await pageAdmin();

  const [users, ranks] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, profile: { isNot: null } },
      orderBy: { profile: { name: "asc" } },
      select: {
        id: true,
        username: true,
        rating: { select: { mmr: true } },
        profile: {
          select: {
            name: true,
            nickname: true,
            photoUrl: true,
            position: true,
            stars: true,
            starsUpdatedAt: true,
          },
        },
      },
    }),
    mmrRanks(),
  ]);

  const players: EvaluationPlayer[] = users
    .filter((user) => user.profile)
    .map((user) => ({
      userId: user.id,
      name: user.profile!.name,
      nickname: user.profile!.nickname,
      photoUrl: user.profile!.photoUrl,
      positionLabel: POSITION_LABEL[user.profile!.position],
      stars: user.profile!.stars,
      starsUpdatedAt: user.profile!.starsUpdatedAt?.toISOString() ?? null,
      // Referencia para o organizador avaliar; a pagina e so dele, entao o numero nao vaza.
      mmr: user.rating?.mmr ?? null,
      mmrRank: ranks.get(user.id) ?? null,
    }));

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Avaliar jogadores</h1>
        <p className="mt-1 text-sm text-slate-400">
          As estrelas são a sua avaliação de cada jogador e é por elas que o sorteio equilibra os times. O MMR
          aparece aqui só como referência: ele ordena o ranking e não muda estrela nenhuma.
        </p>
      </div>

      <PlayerEvaluation players={players} />
    </div>
  );
}
