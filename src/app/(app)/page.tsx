import Link from "next/link";
import { CalendarDays, MapPin, Radio, Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isAdmin, pageUserWithProfile } from "@/lib/session";
import { formatCents, formatDateTime, GAMEDAY_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/labels";
import { Badge, Button, Card, EmptyState, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await pageUserWithProfile();
  const admin = isAdmin(user);

  const [gameDay, myEvents, myMatches] = await Promise.all([
    prisma.gameDay.findFirst({
      where: { status: { not: "FINISHED" } },
      orderBy: { scheduledAt: "asc" },
      include: {
        _count: { select: { registrations: true } },
        registrations: { where: { userId: user.id } },
      },
    }),
    prisma.matchEvent.groupBy({
      by: ["type"],
      where: { userId: user.id, match: { status: "FINISHED" } },
      _count: { _all: true },
    }),
    prisma.teamPlayer.count({ where: { userId: user.id } }),
  ]);

  const myRegistration = gameDay?.registrations[0] ?? null;
  const goals = myEvents.find((entry) => entry.type === "GOAL")?._count._all ?? 0;
  const assists = myEvents.find((entry) => entry.type === "ASSIST")?._count._all ?? 0;

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm text-slate-400">Salve,</p>
        <h1 className="text-2xl font-bold tracking-tight">{user.name.split(" ")[0]}</h1>
      </div>

      <section>
        <SectionTitle hint={admin ? "Você organiza" : undefined}>Próxima pelada</SectionTitle>

        {!gameDay ? (
          <EmptyState
            title="Nenhuma pelada marcada"
            description={admin ? "Crie a próxima em Peladas." : "Fique de olho, o organizador vai marcar."}
          />
        ) : (
          <Card className="grid gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold">{gameDay.title}</h3>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
                  <CalendarDays size={15} /> {formatDateTime(gameDay.scheduledAt)}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-400">
                  <MapPin size={15} /> {gameDay.location}
                </p>
              </div>
              <Badge tone={gameDay.status === "LIVE" ? "good" : "info"}>
                {gameDay.status === "LIVE" ? (
                  <>
                    <span className="pulse-live h-1.5 w-1.5 rounded-full bg-pitch-400" /> Ao vivo
                  </>
                ) : (
                  GAMEDAY_STATUS_LABEL[gameDay.status]
                )}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
              <span>
                {gameDay._count.registrations} de {gameDay.maxPlayers} inscritos
              </span>
              <span className="text-slate-600">•</span>
              <span>{formatCents(gameDay.pricePerPlayerCents)} por jogador</span>
            </div>

            {myRegistration ? (
              <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm">
                <span className="text-slate-300">Você está inscrito.</span>
                <Badge
                  tone={
                    myRegistration.paymentStatus === "CONFIRMED"
                      ? "good"
                      : myRegistration.paymentStatus === "REJECTED"
                        ? "bad"
                        : "warn"
                  }
                >
                  {PAYMENT_STATUS_LABEL[myRegistration.paymentStatus]}
                </Badge>
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <Link href={`/peladas/${gameDay.id}`}>
                <Button variant="secondary" size="lg" className="w-full">
                  Ver a pelada
                </Button>
              </Link>

              {gameDay.status === "LIVE" || gameDay.status === "TEAMS_SET" ? (
                <Link href={admin ? `/peladas/${gameDay.id}/painel` : `/peladas/${gameDay.id}/ao-vivo`}>
                  <Button size="lg" className="w-full">
                    <Radio size={18} /> {admin ? "Abrir painel" : "Acompanhar"}
                  </Button>
                </Link>
              ) : null}
            </div>
          </Card>
        )}
      </section>

      <section>
        <SectionTitle>Seus números</SectionTitle>
        <Card>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-2xl font-bold">{goals}</p>
              <p className="text-xs text-slate-500">Gols</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{assists}</p>
              <p className="text-xs text-slate-500">Assistências</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{myMatches}</p>
              <p className="text-xs text-slate-500">Escalações</p>
            </div>
          </div>
          <Link href="/ranking" className="mt-4 block">
            <Button variant="ghost" className="w-full">
              <Trophy size={16} /> Ver o ranking completo
            </Button>
          </Link>
        </Card>
      </section>
    </div>
  );
}
