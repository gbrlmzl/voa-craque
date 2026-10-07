import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/http";
import { summarizeTeam, type TeamHistoryEntry, type TeamRecord } from "@/lib/team-record";

export type TeamSummaryPlayer = {
  userId: string;
  name: string;
  photoUrl: string | null;
  isKeeper: boolean;
};

export type TeamSummary = {
  team: {
    id: string;
    name: string;
    /** Posicao na fila, comecando em 1; null quando o time nao esta na fila (em quadra). */
    queuePosition: number | null;
  };
  /** Elenco atual: o TeamPlayer ja reflete as trocas "ate o fim da pelada". */
  players: TeamSummaryPlayer[];
  record: TeamRecord;
  history: (TeamHistoryEntry & { opponentName: string })[];
};

/**
 * Elenco e retrospecto de um time, buscados so quando o modal abre: fica fora do
 * snapshot que o SSE empurra a cada lance (ver o cuidado em services/live.ts).
 */
export async function buildTeamSummary(gameDayId: string, teamId: string): Promise<TeamSummary> {
  const [teams, finished] = await Promise.all([
    prisma.team.findMany({
      where: { gameDayId },
      select: {
        id: true,
        name: true,
        queuePosition: true,
        players: {
          select: {
            userId: true,
            isKeeper: true,
            user: {
              select: {
                username: true,
                profile: { select: { name: true, nickname: true, photoUrl: true } },
              },
            },
          },
        },
      },
    }),
    prisma.match.findMany({
      where: { gameDayId, status: "FINISHED" },
      orderBy: { orderIndex: "asc" },
      select: {
        id: true,
        orderIndex: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        result: true,
      },
    }),
  ]);

  // O filtro por pelada vale tambem para quem passa o id de um time de outra pelada.
  const team = teams.find((candidate) => candidate.id === teamId);
  if (!team) throw notFound("Time não encontrado.");

  const names = new Map(teams.map((candidate) => [candidate.id, candidate.name]));
  const { record, history } = summarizeTeam(teamId, finished);

  const queued = teams
    .filter((candidate) => candidate.queuePosition !== null)
    .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0));
  const queueIndex = queued.findIndex((candidate) => candidate.id === teamId);

  return {
    team: { id: team.id, name: team.name, queuePosition: queueIndex >= 0 ? queueIndex + 1 : null },
    players: team.players
      .map((member) => ({
        userId: member.userId,
        // Mesmo nome exibido do painel ao vivo: apelido, senao nome, senao username.
        name: member.user.profile?.nickname || member.user.profile?.name || member.user.username,
        photoUrl: member.user.profile?.photoUrl ?? null,
        isKeeper: member.isKeeper,
      }))
      .sort((a, b) => Number(b.isKeeper) - Number(a.isKeeper) || a.name.localeCompare(b.name, "pt-BR")),
    record,
    history: history.map((entry) => ({ ...entry, opponentName: names.get(entry.opponentTeamId) ?? "?" })),
  };
}
