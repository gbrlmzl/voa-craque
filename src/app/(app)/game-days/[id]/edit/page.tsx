import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { pageAdmin } from "@/lib/session";
import { GameDayForm, type GameDayValues } from "@/components/forms/GameDayForm";

export const dynamic = "force-dynamic";

/** datetime-local espera hora local sem fuso. */
function toLocalInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default async function EditGameDayPage({ params }: { params: Promise<{ id: string }> }) {
  await pageAdmin();
  const { id } = await params;

  const gameDay = await prisma.gameDay.findUnique({ where: { id } });
  if (!gameDay) notFound();

  const initial: GameDayValues = {
    title: gameDay.title,
    scheduledAt: toLocalInput(gameDay.scheduledAt),
    location: gameDay.location,
    price: (gameDay.pricePerPlayerCents / 100).toFixed(2).replace(".", ","),
    durationMin: String(Math.round(gameDay.matchDurationSec / 60)),
    goalsToWin: String(gameDay.goalsToWin),
    maxPlayers: String(gameDay.maxPlayers),
    teamSize: String(gameDay.teamSize),
    pixKey: gameDay.pixKey ?? "",
    notes: gameDay.notes ?? "",
  };

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Editar pelada</h1>
      <GameDayForm initial={initial} gameDayId={gameDay.id} />
    </div>
  );
}
