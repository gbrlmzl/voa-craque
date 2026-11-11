import Link from "next/link";
import { CalendarDays, MapPin, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isAdmin, pageViewer } from "@/lib/session";
import { formatCents, formatDateTime, GAMEDAY_STATUS_LABEL } from "@/lib/labels";
import { Badge, Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  OPEN: "info",
  TEAMS_SET: "warn",
  LIVE: "good",
  FINISHED: "neutral",
  CANCELED: "bad",
} as const;

export default async function GameDaysPage() {
  const user = await pageViewer("/game-days");
  const admin = isAdmin(user);

  const gameDays = await prisma.gameDay.findMany({
    orderBy: [{ status: "asc" }, { scheduledAt: "desc" }],
    include: {
      _count: { select: { registrations: true, matches: true } },
      // Visitante nao tem inscricao: take 0 evita a leitura sem mudar o formato.
      registrations: user ? { where: { userId: user.id }, select: { id: true } } : { select: { id: true }, take: 0 },
    },
  });

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Peladas</h1>

      {gameDays.length === 0 ? (
        <EmptyState
          title="Nenhuma pelada por aqui"
          description={admin ? "Crie a primeira no botão abaixo." : "O organizador ainda não marcou nada."}
        />
      ) : (
        <div className="grid gap-3 sm:pb-12">
          {gameDays.map((gameDay) => (
            <Link key={gameDay.id} href={`/game-days/${gameDay.id}`} className="block">
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

      {admin ? (
        <Link
          href="/game-days/new"
          aria-label="Nova pelada"
          className="fab-offset fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+6.25rem)] z-30 inline-flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-pitch-500 text-night-950 shadow-xl shadow-black/40 transition-colors hover:bg-pitch-400 active:bg-pitch-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pitch-400 sm:right-6 sm:bottom-6"
        >
          <Plus size={38} strokeWidth={2.5} aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}
