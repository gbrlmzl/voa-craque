import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Pencil, Radio, Shuffle, Trophy, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isAdmin, pageUserWithProfile } from "@/lib/session";
import {
  formatCents,
  formatDateTime,
  formatMinutes,
  GAMEDAY_STATUS_LABEL,
  teamColor,
} from "@/lib/labels";
import { Badge, Button, Card, EmptyState, SectionTitle } from "@/components/ui";
import { PlayerChip, Stars } from "@/components/Player";
import { RegistrationPanel } from "@/components/gameday/RegistrationPanel";
import { PaymentList, type PaymentRow } from "@/components/gameday/PaymentList";
import { FinishGameDayButton } from "@/components/gameday/FinishGameDayButton";
import { ShareStoryButton } from "@/components/gameday/ShareStoryButton";
import { buildGameDayStats } from "@/services/gameday-stats";

export const dynamic = "force-dynamic";

export default async function GameDayPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUserWithProfile();
  const admin = isAdmin(user);
  const { id } = await params;

  const gameDay = await prisma.gameDay.findUnique({
    where: { id },
    include: {
      registrations: {
        orderBy: { createdAt: "asc" },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              profile: { select: { name: true, photoUrl: true, stars: true } },
            },
          },
        },
      },
      teams: {
        orderBy: { name: "asc" },
        include: {
          players: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  profile: { select: { name: true, photoUrl: true, stars: true } },
                },
              },
            },
          },
        },
      },
      reserves: {
        include: {
          user: {
            select: { id: true, username: true, profile: { select: { name: true, photoUrl: true } } },
          },
        },
      },
    },
  });

  if (!gameDay) notFound();

  const myStats =
    gameDay.status === "FINISHED"
      ? (await buildGameDayStats(gameDay.id)).find((row) => row.userId === user.id)
      : undefined;

  const myRegistration = gameDay.registrations.find((row) => row.userId === user.id) ?? null;
  const paymentRows: PaymentRow[] = gameDay.registrations.map((row) => ({
    id: row.id,
    userId: row.userId,
    name: row.user.profile?.name ?? row.user.username,
    photoUrl: row.user.profile?.photoUrl ?? null,
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    receiptUrl: row.receiptUrl,
  }));

  const hasTeams = gameDay.teams.length > 0;
  const liveHref = admin ? `/game-days/${id}/panel` : `/game-days/${id}/live`;

  return (
    <div className="grid gap-6">
      <header>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight">{gameDay.title}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
              <CalendarDays size={15} /> {formatDateTime(gameDay.scheduledAt)}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-400">
              <MapPin size={15} /> {gameDay.location}
            </p>
          </div>
          <Badge tone={gameDay.status === "LIVE" ? "good" : "info"}>
            {GAMEDAY_STATUS_LABEL[gameDay.status]}
          </Badge>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
          <span>{formatCents(gameDay.pricePerPlayerCents)} por jogador</span>
          <span>•</span>
          <span>{formatMinutes(gameDay.matchDurationSec)} por partida</span>
          <span>•</span>
          <span>{gameDay.goalsToWin} gols encerram</span>
          <span>•</span>
          <span>{gameDay.teamSize} por time</span>
        </div>

        {gameDay.notes ? (
          <p className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-sm text-slate-300">{gameDay.notes}</p>
        ) : null}
      </header>

      {gameDay.status === "FINISHED" ? (
        <Link href={`/game-days/${id}/stats`}>
          <Button variant="secondary" size="lg" className="w-full">
            <Trophy size={18} /> Ver estatísticas da pelada
          </Button>
        </Link>
      ) : null}

      {myStats ? (
        <ShareStoryButton
          gameDay={{
            title: gameDay.title,
            scheduledAt: gameDay.scheduledAt.toISOString(),
            location: gameDay.location,
          }}
          stats={myStats}
        />
      ) : null}

      {(hasTeams && gameDay.status !== "FINISHED") || gameDay.status === "LIVE" ? (
        <Link href={liveHref}>
          <Button size="lg" className="w-full">
            <Radio size={18} /> {admin ? "Abrir painel ao vivo" : "Acompanhar ao vivo"}
          </Button>
        </Link>
      ) : null}

      {admin ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Link href={`/game-days/${id}/teams`}>
            <Button variant="secondary" size="lg" className="w-full">
              <Shuffle size={18} /> {hasTeams ? "Refazer times" : "Montar times"}
            </Button>
          </Link>
          <Link href={`/game-days/${id}/edit`}>
            <Button variant="secondary" size="lg" className="w-full">
              <Pencil size={18} /> Editar pelada
            </Button>
          </Link>
        </div>
      ) : null}

      {gameDay.status !== "FINISHED" ? (
        <RegistrationPanel
          gameDayId={gameDay.id}
          price={formatCents(gameDay.pricePerPlayerCents)}
          pixKey={gameDay.pixKey}
          registration={
            myRegistration
              ? {
                  id: myRegistration.id,
                  paymentMethod: myRegistration.paymentMethod,
                  paymentStatus: myRegistration.paymentStatus,
                  receiptUrl: myRegistration.receiptUrl,
                  rejectedReason: myRegistration.rejectedReason,
                }
              : null
          }
          open={gameDay.status === "OPEN"}
          full={gameDay.registrations.length >= gameDay.maxPlayers}
        />
      ) : null}

      {hasTeams ? (
        <section>
          <SectionTitle hint={`${gameDay.teams.length} times`}>Times</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {gameDay.teams.map((team) => {
              const palette = teamColor(team.name);
              return (
                <Card key={team.id} className={`border ${palette.border}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className={`flex items-center gap-2 font-semibold ${palette.text}`}>
                      <span className={`h-2.5 w-2.5 rounded-full ${palette.dot}`} /> Time {team.name}
                    </span>
                    <span className="text-xs text-slate-500">força {team.averageStrength}</span>
                  </div>
                  <div className="grid gap-0.5">
                    {team.players.map((member) => (
                      <PlayerChip
                        key={member.id}
                        userId={member.userId}
                        name={member.user.profile?.name ?? member.user.username}
                        photoUrl={member.user.profile?.photoUrl}
                        subtitle={member.isKeeper ? "Goleiro" : undefined}
                      />
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>

          {gameDay.reserves.length > 0 ? (
            <Card className="mt-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300">
                <Users size={16} /> Reservas
              </p>
              <div className="flex flex-wrap gap-1">
                {gameDay.reserves.map((reserve) => (
                  <PlayerChip
                    key={reserve.id}
                    userId={reserve.userId}
                    name={reserve.user.profile?.name ?? reserve.user.username}
                    photoUrl={reserve.user.profile?.photoUrl}
                  />
                ))}
              </div>
            </Card>
          ) : null}
        </section>
      ) : null}

      {admin ? (
        <PaymentList gameDayId={gameDay.id} rows={paymentRows} />
      ) : gameDay.status !== "FINISHED" ? (
        <section>
          <SectionTitle hint={`${gameDay.registrations.length}/${gameDay.maxPlayers}`}>
            Quem vai
          </SectionTitle>
          {gameDay.registrations.length === 0 ? (
            <EmptyState title="Ninguém se inscreveu ainda" description="Seja o primeiro." />
          ) : (
            <Card className="grid gap-0.5 p-2">
              {gameDay.registrations.map((row) => (
                <PlayerChip
                  key={row.id}
                  userId={row.userId}
                  name={row.user.profile?.name ?? row.user.username}
                  photoUrl={row.user.profile?.photoUrl}
                  subtitle={<Stars value={row.user.profile?.stars ?? null} size={11} />}
                />
              ))}
            </Card>
          )}
        </section>
      ) : null}

      {admin && gameDay.status !== "FINISHED" ? (
        <section>
          <SectionTitle>Fim de papo</SectionTitle>
          <FinishGameDayButton gameDayId={gameDay.id} variant="secondary" className="w-full" />
        </section>
      ) : null}
    </div>
  );
}
