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
