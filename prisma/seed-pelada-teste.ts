import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";
import { PrismaClient, type Foot, type Position } from "../src/generated/prisma/client";

/**
 * Seed isolada para testes manuais: 19 jogadores + 1 admin, todos inscritos
 * numa mesma pelada. Roda por fora da seed principal (`db:seed`) para nao
 * poluir os dados de exemplo dela. Uso: `npm run db:seed:pelada-teste`.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const PLAYER_COUNT = 19;
const PLAYER_PASSWORD = "Senhapadraoteste";

const ADMIN_USERNAME = "adminteste";
const ADMIN_PASSWORD = "adminteste";
const ADMIN_EMAIL = "adminteste@teste.com";

const GAME_DAY_TITLE = "Pelada Sesi 23/09";

const FIRST_NAMES = [
  "Lucas", "Gabriel", "Matheus", "Rafael", "Bruno", "Felipe", "Thiago", "Gustavo",
  "Rodrigo", "Diego", "Vinicius", "Leonardo", "Eduardo", "Marcelo", "Fernando",
  "Ricardo", "Alexandre", "Daniel", "Andre", "Paulo", "Carlos", "Henrique",
  "Igor", "Renato", "Sergio",
];

const LAST_NAMES = [
  "Silva", "Santos", "Oliveira", "Souza", "Pereira", "Costa", "Rodrigues",
  "Almeida", "Nascimento", "Lima", "Araujo", "Fernandes", "Carvalho", "Gomes",
  "Martins", "Rocha", "Ribeiro", "Alves", "Monteiro", "Cardoso", "Teixeira",
  "Correia", "Barbosa", "Moura", "Pinto",
];

const NICKNAMES = [
  "Formiga", "Canhoto", "Foguete", "Furacao", "Pipoca", "Xerife", "Trator",
  "Bolinha", "Fenomeno", "Cascudo", "Coruja", "Tico", "Buda", "Zaga", "Flecha",
];

// Sem goleiro: os inscritos de teste nascem so com posicoes de linha.
const POSITIONS: Position[] = ["FIXO", "ALA", "PIVO"];
const FEET: Foot[] = ["LEFT", "RIGHT", "BOTH"];

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFullName(): string {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

/** Sorteia quais posicoes, dentre `total` inscritos, ganham vulgo. */
function pickNicknameSlots(total: number, howMany: number): boolean[] {
  const flags = Array.from({ length: total }, (_, index) => index < howMany);
  for (let i = flags.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [flags[i], flags[j]] = [flags[j], flags[i]];
  }
  return flags;
}

function randomProfileBase() {
  return {
    foot: pick(FEET),
    position: pick(POSITIONS),
    age: randomInt(18, 38),
    heightCm: randomInt(165, 195),
    weightKg: randomInt(62, 95),
  };
}

async function main() {
  // 19 jogadores + o admin: os 10 primeiros do embaralhamento levam vulgo.
  const nicknameSlots = pickNicknameSlots(PLAYER_COUNT + 1, 10);

  const players = Array.from({ length: PLAYER_COUNT }, (_, index) => {
    const n = index + 1;
    return {
      username: `jogadorteste${n}`,
      email: `jogadorteste${n}@teste.com`,
      name: randomFullName(),
      nickname: nicknameSlots[index] ? pick(NICKNAMES) : null,
      ...randomProfileBase(),
    };
  });
  const adminNickname = nicknameSlots[PLAYER_COUNT] ? pick(NICKNAMES) : null;

  const [playerPasswordHash, adminPasswordHash] = await Promise.all([
    hash(PLAYER_PASSWORD, 10),
    hash(ADMIN_PASSWORD, 10),
  ]);

  const admin = await prisma.user.upsert({
    where: { username: ADMIN_USERNAME },
    update: {},
    create: {
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL,
      role: "ADMIN",
      passwordHash: adminPasswordHash,
      profile: {
        create: {
          name: "Admin Teste",
          nickname: adminNickname,
          completed: true,
          ...randomProfileBase(),
        },
      },
    },
  });
  console.log(`[seed-pelada-teste] admin: ${admin.username} / senha: ${ADMIN_PASSWORD}`);

  const createdPlayers = [];
  for (const player of players) {
    const user = await prisma.user.upsert({
      where: { username: player.username },
      update: {},
      create: {
        username: player.username,
        email: player.email,
        role: "USER",
        passwordHash: playerPasswordHash,
        profile: {
          create: {
            name: player.name,
            nickname: player.nickname,
            foot: player.foot,
            position: player.position,
            age: player.age,
            heightCm: player.heightCm,
            weightKg: player.weightKg,
            completed: true,
          },
        },
      },
    });
    createdPlayers.push(user);
  }
  console.log(`[seed-pelada-teste] ${createdPlayers.length} jogadores de teste (senha: ${PLAYER_PASSWORD})`);

  let gameDay = await prisma.gameDay.findFirst({ where: { title: GAME_DAY_TITLE } });
  if (!gameDay) {
    gameDay = await prisma.gameDay.create({
      data: {
        title: GAME_DAY_TITLE,
        scheduledAt: new Date(2026, 8, 23, 16, 0, 0),
        location: "Sesi",
        pricePerPlayerCents: 600,
        matchDurationSec: 480,
        goalsToWin: 2,
        maxPlayers: 20,
        teamSize: 4,
        createdById: admin.id,
      },
    });
    console.log(`[seed-pelada-teste] pelada criada: "${gameDay.title}"`);
  } else {
    console.log(`[seed-pelada-teste] pelada ja existia: "${gameDay.title}"`);
  }

  const participants = [...createdPlayers, admin];
  for (const [index, participant] of participants.entries()) {
    await prisma.registration.upsert({
      where: { gameDayId_userId: { gameDayId: gameDay.id, userId: participant.id } },
      update: {},
      create: {
        gameDayId: gameDay.id,
        userId: participant.id,
        paymentMethod: index % 4 === 0 ? "ON_SITE" : "PIX",
        paymentStatus: "CONFIRMED",
        confirmedById: admin.id,
        confirmedAt: new Date(),
        amountCents: gameDay.pricePerPlayerCents,
      },
    });
  }
  console.log(`[seed-pelada-teste] ${participants.length} inscritos em "${gameDay.title}"`);

  console.log("\n[seed-pelada-teste] credenciais:");
  console.log(`  admin  -> username: ${admin.username} | senha: ${ADMIN_PASSWORD}`);
  for (const player of players) {
    const vulgo = player.nickname ? ` (vulgo: ${player.nickname})` : "";
    console.log(`  ${player.username} -> senha: ${PLAYER_PASSWORD} | ${player.name}${vulgo}`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("[seed-pelada-teste] falhou", error);
    await prisma.$disconnect();
    process.exit(1);
  });
