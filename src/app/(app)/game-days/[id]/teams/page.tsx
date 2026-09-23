import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { pageAdmin } from "@/lib/session";
import { POSITION_LABEL } from "@/lib/labels";
import { loadPool } from "@/services/teams";
import { Button } from "@/components/ui";
import { TeamBuilder, type BuilderPlayer, type BuilderTeam } from "@/components/gameday/TeamBuilder";

export const dynamic = "force-dynamic";

export default async function TeamsPage({ params }: { params: Promise<{ id: string }> }) {
  await pageAdmin();
  const { id } = await params;

  const gameDay = await prisma.gameDay.findUnique({
    where: { id },
    include: {
      teams: { orderBy: { name: "asc" }, include: { players: { select: { userId: true } } } },
      reserves: { select: { userId: true } },
      matches: { where: { status: { not: "SCHEDULED" } }, select: { id: true } },
    },
  });
  if (!gameDay) notFound();

  const poolRaw = await loadPool(id);
  const pool: BuilderPlayer[] = poolRaw.map((player) => ({
    userId: player.userId,
    name: player.name,
    photoUrl: player.photoUrl,
    stars: player.stars,
    positionLabel: player.position ? POSITION_LABEL[player.position] : "Sem posição",
    isKeeper: player.position === "GOALKEEPER",
    paymentStatus: player.paymentStatus,
  }));

  const teams: BuilderTeam[] = gameDay.teams.map((team) => ({
    name: team.name,
    averageStrength: team.averageStrength,
    playerIds: team.players.map((member) => member.userId),
  }));

  return (
    <div className="grid gap-4">
      <div>
        <Link href={`/game-days/${id}`}>
          <Button variant="ghost" size="sm" className="-ml-2">
            <ArrowLeft size={16} /> {gameDay.title}
          </Button>
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Times</h1>
        <p className="mt-1 text-sm text-slate-400">
          O sorteio equilibra por estrelas, altura e peso, e espalha os goleiros. Depois dá para ajustar
          jogador por jogador.
        </p>
      </div>

      <TeamBuilder
        gameDayId={id}
        teamSize={gameDay.teamSize}
        pool={pool}
        teams={teams}
        reserveIds={gameDay.reserves.map((reserve) => reserve.userId)}
        locked={gameDay.status === "FINISHED" || gameDay.matches.length > 0}
      />
    </div>
  );
}
