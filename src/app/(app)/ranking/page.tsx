import { pageUserWithProfile } from "@/lib/session";
import { buildRanking } from "@/services/ranking";
import { RankingTable } from "@/components/RankingTable";

export const dynamic = "force-dynamic";

export default async function RankingPage() {
  await pageUserWithProfile();
  const rows = await buildRanking();

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ranking</h1>
        <p className="mt-1 text-sm text-slate-400">
          Escolha uma área para ver o ranking. Toque no jogador para ver a ficha dele.
        </p>
      </div>

      <RankingTable rows={rows} />
    </div>
  );
}
