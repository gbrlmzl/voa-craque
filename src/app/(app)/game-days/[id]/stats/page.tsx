import { notFound } from "next/navigation";
import { Flame, Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatPercent } from "@/lib/labels";
import { Avatar } from "@/components/Player";
import { Card, EmptyState, SectionTitle } from "@/components/ui";
import { buildGameDayStats } from "@/services/gameday-stats";

export const dynamic = "force-dynamic";

/**
 * Tela publica: qualquer um com o link ve o resultado de uma pelada encerrada,
 * sem precisar de login. A pelada em si (inscricao, pagamento, escalacao)
 * continua exigindo login em `/game-days/[id]`.
 */
export default async function GameDayStatsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const gameDay = await prisma.gameDay.findUnique({
    where: { id },
    select: { id: true, title: true, scheduledAt: true, location: true, status: true },
  });

  if (!gameDay || gameDay.status !== "FINISHED") notFound();

  const stats = await buildGameDayStats(gameDay.id);
  const sorted = [...stats].sort(
    (a, b) => b.goals - a.goals || b.assists - a.assists || b.winRate - a.winRate || a.name.localeCompare(b.name, "pt-BR"),
  );

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Trophy size={22} className="text-pitch-400" /> {gameDay.title}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          {formatDateTime(gameDay.scheduledAt)} · {gameDay.location}
        </p>
      </div>

      <SectionTitle hint={`${sorted.length} jogadores`}>Estatísticas da pelada</SectionTitle>

      {sorted.length === 0 ? (
        <EmptyState title="Sem números ainda" description="Ninguém completou uma partida nesta pelada." />
      ) : (
        <Card className="grid gap-1 p-2">
          {sorted.map((row) => (
            <div key={row.userId} className="flex items-center gap-3 rounded-xl px-2 py-2">
              <Avatar name={row.name} photoUrl={row.photoUrl} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate font-medium text-slate-100">
                  <span className="truncate">{row.nickname || row.name}</span>
                  {row.topScorer ? <Flame size={14} className="shrink-0 text-amber-400" /> : null}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {row.played} {row.played === 1 ? "jogo" : "jogos"} · {row.won}{" "}
                  {row.won === 1 ? "vitória" : "vitórias"} · {formatPercent(row.winRate)}
                </span>
              </span>
              <span className="grid shrink-0 grid-cols-2 gap-x-3 text-right text-xs text-slate-400 tabular-nums">
                <span>{row.goals} gols</span>
                <span>{row.assists} assist.</span>
              </span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
