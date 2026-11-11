import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, RotateCcw, Shuffle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { canCancel, teamsLocked } from "@/lib/gameday-lifecycle";
import { pageAdmin } from "@/lib/session";
import { Button, Card, SectionTitle } from "@/components/ui";
import { AdminRegistrationModal } from "@/components/gameday/AdminRegistrationModal";
import { CancelGameDayButton } from "@/components/gameday/CancelGameDayButton";
import { RestoreGameDayButton } from "@/components/gameday/RestoreGameDayButton";

export const dynamic = "force-dynamic";

export default async function GameDaySettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await pageAdmin(`/game-days/${id}/settings`);
  const gameDay = await prisma.gameDay.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      maxPlayers: true,
      registrations: { select: { id: true } },
      matches: { where: { status: { not: "SCHEDULED" } }, select: { id: true }, take: 1 },
    },
  });
  if (!gameDay) notFound();

  const matchStarted = gameDay.matches.length > 0;
  const locked = teamsLocked({ status: gameDay.status, matchStarted });

  return (
    <div className="grid gap-4">
      <div>
        <Link href={`/game-days/${id}`}>
          <Button variant="ghost" size="sm" className="-ml-2">
            <ArrowLeft size={16} /> {gameDay.title}
          </Button>
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Configurações</h1>
      </div>

      {gameDay.status === "FINISHED" || gameDay.status === "CANCELED" ? (
        <Card>
          <p className="text-sm text-slate-300">
            {gameDay.status === "CANCELED" ? "Esta pelada foi cancelada." : "Esta pelada foi encerrada."}
          </p>
        </Card>
      ) : (
        <>
          <Card className="grid gap-3">
            <SectionTitle>Ações da pelada</SectionTitle>
            {locked ? (
              <Button variant="secondary" size="lg" className="w-full" disabled aria-disabled="true">
                <Shuffle size={18} /> Refazer times
              </Button>
            ) : (
              <Link href={`/game-days/${id}/teams`}>
                <Button variant="secondary" size="lg" className="w-full">
                  <Shuffle size={18} /> Refazer times
                </Button>
              </Link>
            )}
            <Link href={`/game-days/${id}/edit`}>
              <Button variant="secondary" size="lg" className="w-full">
                <Pencil size={18} /> Editar pelada
              </Button>
            </Link>
            {gameDay.status === "TEAMS_SET" && !locked ? <RestoreGameDayButton gameDayId={id} /> : null}
            {canCancel({ status: gameDay.status, matchStarted }) ? <CancelGameDayButton gameDayId={id} /> : null}
          </Card>

          <AdminRegistrationModal
            gameDayId={gameDay.id}
            status={gameDay.status}
            matchStarted={matchStarted}
            registeredCount={gameDay.registrations.length}
            maxPlayers={gameDay.maxPlayers}
          />
        </>
      )}
    </div>
  );
}
