import Link from "next/link";
import { CalendarDays, MapPin, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isAdmin, pageUserWithProfile } from "@/lib/session";
import { formatCents, formatDateTime, GAMEDAY_STATUS_LABEL } from "@/lib/labels";
import { Badge, Button, Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  OPEN: "info",
  TEAMS_SET: "warn",
  LIVE: "good",
  FINISHED: "neutral",
} as const;

export default async function GameDaysPage() {
  const user = await pageUserWithProfile();
  const admin = isAdmin(user);

  const gameDays = await prisma.gameDay.findMany({
    orderBy: [{ status: "asc" }, { scheduledAt: "desc" }],
    include: {
      _count: { select: { registrations: true, matches: true } },
      registrations: { where: { userId: user.id }, select: { id: true } },
    },
  });

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Peladas</h1>
        {admin ? (
          <Link href="/peladas/nova">
            <Button>
              <Plus size={18} /> Nova
            </Button>
          </Link>
        ) : null}
      </div>

      {gameDays.length === 0 ? (
        <EmptyState
          title="Nenhuma pelada por aqui"
          description={admin ? "Crie a primeira no botão acima." : "O organizador ainda não marcou nada."}
        />
      ) : (
        <div className="grid gap-3">
          {gameDays.map((gameDay) => (
            <Link key={gameDay.id} href={`/peladas/${gameDay.id}`} className="block">
              <Card className="transition-colors hover:border-white/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{gameDay.title}</h2>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
                      <CalendarDays size={14} /> {formatDateTime(gameDay.scheduledAt)}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-400">
                      <MapPin size={14} /> {gameDay.location}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[gameDay.status]}>{GAMEDAY_STATUS_LABEL[gameDay.status]}</Badge>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>
                    {gameDay._count.registrations}/{gameDay.maxPlayers} inscritos
                  </span>
                  <span>•</span>
                  <span>{formatCents(gameDay.pricePerPlayerCents)}</span>
                  {gameDay._count.matches > 0 ? (
                    <>
                      <span>•</span>
                      <span>{gameDay._count.matches} partidas</span>
                    </>
                  ) : null}
                  {gameDay.registrations.length > 0 ? (
                    <Badge tone="good" className="ml-auto">
                      Inscrito
                    </Badge>
                  ) : null}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
