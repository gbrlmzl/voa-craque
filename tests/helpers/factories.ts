import { hashSync } from "bcryptjs";
import type {
  Foot,
  GameDay,
  GameDayStatus,
  PaymentMethod,
  PaymentStatus,
  Position,
  Role,
  User,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/session";
import { changeMatchState, recordMatchEvent } from "@/services/match";
import { finishGameDay as finishGameDayService, startGameDay } from "@/services/gameday";
import { drawTeams } from "@/services/teams";

// Contador, nunca Date.now() sozinho: dois usuarios criados no mesmo milissegundo
// nao podem colidir em username/e-mail.
let counter = 0;
const next = () => ++counter;

export const DEFAULT_PASSWORD = "Senha@123";
// Custo baixo: a suite cria centenas de usuarios.
const DEFAULT_HASH = hashSync(DEFAULT_PASSWORD, 4);

const POSITIONS: Position[] = ["GOALKEEPER", "FIXO", "ALA", "PIVO", "ALA"];

export type UserInput = {
  username?: string;
  email?: string;
  role?: Role;
  active?: boolean;
  password?: string | null;
  /** Cria o perfil de jogador completo. */
  profile?: boolean | Partial<ProfileInput>;
};

export type ProfileInput = {
  name: string;
  nickname: string | null;
  foot: Foot;
  position: Position;
  age: number;
  heightCm: number;
  weightKg: number;
  stars: number | null;
  photoUrl: string | null;
  completed: boolean;
};

export async function createUser(input: UserInput = {}): Promise<User> {
  const n = next();
  const username = input.username ?? `jogador${String(n).padStart(2, "0")}`;
  const profile = input.profile === false ? null : input.profile === undefined || input.profile === true ? {} : input.profile;
  const withProfile = input.profile !== undefined && input.profile !== false;

  return prisma.user.create({
    data: {
      username,
      email: input.email ?? `${username}@teste.voacraque.app`,
      role: input.role ?? "USER",
      active: input.active ?? true,
      passwordHash:
        input.password === null ? null : input.password ? hashSync(input.password, 4) : DEFAULT_HASH,
      profile: withProfile
        ? {
            create: {
              name: `Jogador ${n}`,
              nickname: null,
              foot: "RIGHT",
              position: POSITIONS[n % POSITIONS.length],
              age: 25,
              heightCm: 175,
              weightKg: 72,
              stars: 3,
              completed: true,
              ...profile,
            },
          }
        : undefined,
    },
  });
}

/** Jogador com perfil completo (o padrao de quem ja passou pelo onboarding). */
export function createPlayer(input: UserInput = {}) {
  return createUser({ profile: true, ...input });
}

export const createAdmin = (input: UserInput = {}) => createPlayer({ role: "ADMIN", ...input });
export const createSuperadmin = (input: UserInput = {}) => createPlayer({ role: "SUPERADMIN", ...input });

export function toCurrentUser(user: User & { profile?: { name: string } | null }): CurrentUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.profile?.name ?? null,
    role: user.role,
    profileCompleted: true,
    photoUrl: null,
    hasPassword: user.passwordHash !== null,
    googleLinked: false,
  };
}

export async function ensureSettings(data: Partial<{
  publicAccessEnabled: boolean;
  privateSiteEnabled: boolean;
  registrationOpen: boolean;
  maintenanceMessage: string;
}> = {}) {
  return prisma.systemSetting.upsert({
    where: { id: "global" },
    create: { id: "global", ...data },
    update: data,
  });
}

export type GameDayInput = Partial<{
  title: string;
  status: GameDayStatus;
  scheduledAt: Date;
  location: string;
  maxPlayers: number;
  teamSize: number;
  goalsToWin: number;
  matchDurationSec: number;
  pricePerPlayerCents: number;
  pixKey: string | null;
  createdById: string;
}>;

export async function createGameDay(input: GameDayInput = {}): Promise<GameDay> {
  const n = next();
  const createdById = input.createdById ?? (await createAdmin()).id;
  return prisma.gameDay.create({
    data: {
      title: input.title ?? `Pelada ${n}`,
      scheduledAt: input.scheduledAt ?? new Date("2030-01-01T20:00:00-03:00"),
      location: input.location ?? "Quadra do Bairro",
      pricePerPlayerCents: input.pricePerPlayerCents ?? 1000,
      matchDurationSec: input.matchDurationSec ?? 600,
      goalsToWin: input.goalsToWin ?? 2,
      maxPlayers: input.maxPlayers ?? 20,
      teamSize: input.teamSize ?? 4,
      status: input.status ?? "OPEN",
      pixKey: input.pixKey === undefined ? "pix@voacraque.app" : input.pixKey,
      createdById,
    },
  });
}

export async function registerUser(
  gameDayId: string,
  userId: string,
  { method = "ON_SITE", status = "PENDING" }: { method?: PaymentMethod; status?: PaymentStatus } = {},
) {
  const gameDay = await prisma.gameDay.findUniqueOrThrow({ where: { id: gameDayId } });
  return prisma.registration.create({
    data: {
      gameDayId,
      userId,
      paymentMethod: method,
      paymentStatus: status,
      receiptUrl: method === "PIX" ? "/api/files/comprovantes/teste.png" : null,
      amountCents: gameDay.pricePerPlayerCents,
    },
  });
}

/** Cria `count` jogadores novos e inscreve todos na pelada. */
export async function registerPlayers(
  gameDayId: string,
  count: number,
  options: { method?: PaymentMethod; status?: PaymentStatus; stars?: number | null } = {},
): Promise<User[]> {
  const users: User[] = [];
  for (let i = 0; i < count; i++) {
    const user = await createPlayer({ profile: options.stars === undefined ? true : { stars: options.stars } });
    await registerUser(gameDayId, user.id, options);
    users.push(user);
  }
  return users;
}

// ------------------------------------------------------------ peladas montadas
//
// Estas fabricas usam os servicos reais (sorteio, iniciar, apitar) para chegar ao
// estado que o teste precisa. Quem testa o proprio servico monta a cena na mao.


export type DrawnGameDay = {
  gameDay: GameDay;
  admin: User;
  players: User[];
};

/** Pelada com times sorteados (TEAMS_SET) e a partida de abertura criada. */
export async function createTeams(
  input: GameDayInput & { players?: number; seed?: number } = {},
): Promise<DrawnGameDay> {
  const admin = input.createdById
    ? await prisma.user.findUniqueOrThrow({ where: { id: input.createdById } })
    : await createAdmin();
  const gameDay = await createGameDay({ ...input, createdById: admin.id });
  const players = await registerPlayers(gameDay.id, input.players ?? 12);
  await drawTeams(gameDay.id, toCurrentUser(admin), input.seed ?? 7);
  return { gameDay: await prisma.gameDay.findUniqueOrThrow({ where: { id: gameDay.id } }), admin, players };
}

/** Pelada LIVE com a primeira partida ainda SCHEDULED. */
export async function startLiveGameDay(
  input: GameDayInput & { players?: number; seed?: number } = {},
) {
  const drawn = await createTeams(input);
  await startGameDay(drawn.gameDay.id, toCurrentUser(drawn.admin));
  return { ...drawn, gameDay: await prisma.gameDay.findUniqueOrThrow({ where: { id: drawn.gameDay.id } }) };
}

/** Partida em andamento (apitada) de uma pelada LIVE. */
export async function currentMatch(gameDayId: string) {
  return prisma.match.findFirstOrThrow({
    where: { gameDayId, status: { not: "FINISHED" } },
    orderBy: { orderIndex: "asc" },
    include: { homeTeam: { include: { players: true } }, awayTeam: { include: { players: true } } },
  });
}

export async function whistle(matchId: string, admin: User) {
  await changeMatchState(matchId, "START", toCurrentUser(admin));
}

/** Marca gols para o mandante (`side` = "home") ou o visitante; ultimo gol pode encerrar a partida. */
export async function scoreGoals(
  matchId: string,
  admin: User,
  side: "home" | "away",
  count: number,
  { assist = true }: { assist?: boolean } = {},
) {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    include: { homeTeam: { include: { players: true } }, awayTeam: { include: { players: true } } },
  });
  const team = side === "home" ? match.homeTeam : match.awayTeam;
  const ids: Array<{ eventId: string; assistEventId: string | null }> = [];
  for (let i = 0; i < count; i++) {
    const scorer = team.players[i % team.players.length].userId;
    const assistant = team.players[(i + 1) % team.players.length].userId;
    ids.push(
      await recordMatchEvent(
        matchId,
        { type: "GOAL", userId: scorer, teamId: team.id, assistUserId: assist ? assistant : null },
        toCurrentUser(admin),
      ),
    );
  }
  return ids;
}

/**
 * Pelada ENCERRADA: duas partidas decididas por gols (a segunda dura ate o fim
 * da fila) e MMR aplicado pelo servico de encerramento.
 */
export async function finishGameDay(input: GameDayInput & { players?: number; seed?: number } = {}) {
  const live = await startLiveGameDay(input);
  for (let round = 0; round < 3; round++) {
    const match = await currentMatch(live.gameDay.id);
    await whistle(match.id, live.admin);
    await scoreGoals(match.id, live.admin, round % 2 === 0 ? "home" : "away", live.gameDay.goalsToWin);
  }
  const running = await prisma.match.findFirst({ where: { gameDayId: live.gameDay.id, status: { not: "FINISHED" } } });
  if (running) await whistle(running.id, live.admin);
  await finishGameDayService(live.gameDay.id, toCurrentUser(live.admin));
  return { ...live, gameDay: await prisma.gameDay.findUniqueOrThrow({ where: { id: live.gameDay.id } }) };
}
