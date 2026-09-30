import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Role } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";

/**
 * Seed do piloto: o superadmin (mizael), o organizador (ariel), 19 jogadores e
 * a "Pelada UFPB" com os 20 jogadores (mizael incluso) inscritos. O ariel
 * organiza mas nao joga, entao fica de fora das inscricoes.
 *
 * Nenhum perfil de jogador e criado: cada um monta o proprio no primeiro acesso
 * (/onboarding), porque pe, posicao, idade, altura e peso nao sao obrigatorios
 * aqui nem deviam ser inventados. As senhas abaixo sao provisorias: trocar
 * depois do primeiro login. Idempotente: rodar de novo nao duplica nada nem
 * mexe em senha de conta que ja existe. Uso: `npm run db:seed:piloto`.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

type UserSpec = { username: string; email: string; password: string; role: Role };

const PLAYER_PASSWORD = "Senhajogadorpadrao";

// So o mizael tem e-mail real informado; o resto usa um endereco reservado
// (example.com) que nunca entrega, ate cada um cadastrar o seu.
function placeholderEmail(username: string): string {
  return `${username}@example.com`;
}

const SUPERADMIN: UserSpec = {
  username: "mizael",
  email: "gabrielmzl100@gmail.com",
  password: "Senhatestemude",
  role: "SUPERADMIN",
};

const ORGANIZER: UserSpec = {
  username: "ariel",
  email: placeholderEmail("ariel"),
  password: "arielsenhateste",
  role: "ADMIN",
};

// Os 19 jogadores comuns, na ordem da lista do piloto (o mizael e o 1).
const PLAYER_USERNAMES = [
  "diego", "jotaum", "matheus", "paulo", "iran", "pedro", "jotadois", "dagoberto",
  "wendel", "guilherme", "walison", "caio", "marcone", "samuel", "joao", "jean",
  "john", "caua", "vinicius",
];

const PLAYERS: UserSpec[] = PLAYER_USERNAMES.map((username) => ({
  username,
  email: placeholderEmail(username),
  password: PLAYER_PASSWORD,
  role: "USER",
}));

const GAME_DAY_TITLE = "Pelada UFPB";

// A data veio sem horario: 16h, como na pelada de teste. O app le a data no
// fuso do servidor, entao `new Date(a, m, d, h)` cai no mesmo horario que o
// organizador digitaria no formulario.
const GAME_DAY = {
  title: GAME_DAY_TITLE,
  scheduledAt: new Date(2026, 8, 30, 16, 0, 0),
  location: "Ginásio do Sesi",
  pricePerPlayerCents: 600,
  matchDurationSec: 8 * 60,
  goalsToWin: 2,
  maxPlayers: 20,
  teamSize: 4,
  pixKey: "arielliragdrf@gmail.com",
} as const;

const ROLE_RANK: Record<Role, number> = { USER: 0, ADMIN: 1, SUPERADMIN: 2 };

// Bcrypt custa ~70ms: uma vez por senha distinta, nao por usuario.
const hashes = new Map<string, Promise<string>>();
function passwordHashFor(password: string): Promise<string> {
  let cached = hashes.get(password);
  if (!cached) {
    cached = hashPassword(password);
    hashes.set(password, cached);
  }
  return cached;
}

/**
 * Cria a conta se ainda nao existe (por username ou e-mail). Conta existente
 * nao tem senha nem e-mail alterados; so sobe de papel, nunca rebaixa.
 */
async function ensureUser(spec: UserSpec) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ username: spec.username }, { email: spec.email }] },
  });

  if (!existing) {
    return prisma.user.create({
      data: {
        username: spec.username,
        email: spec.email,
        role: spec.role,
        passwordHash: await passwordHashFor(spec.password),
      },
    });
  }

  if (ROLE_RANK[spec.role] > ROLE_RANK[existing.role]) {
    console.log(`[seed-piloto] ${existing.username}: ${existing.role} -> ${spec.role}`);
    return prisma.user.update({ where: { id: existing.id }, data: { role: spec.role } });
  }
  return existing;
}

async function main() {
  const superadmin = await ensureUser(SUPERADMIN);
  const organizer = await ensureUser(ORGANIZER);
  const players = [];
  for (const spec of PLAYERS) players.push(await ensureUser(spec));
  console.log(
    `[seed-piloto] contas: ${superadmin.username} (${superadmin.role}), ` +
      `${organizer.username} (${organizer.role}), ${players.length} jogadores`,
  );

  let gameDay = await prisma.gameDay.findFirst({ where: { title: GAME_DAY_TITLE } });
  if (!gameDay) {
    gameDay = await prisma.gameDay.create({
      data: { ...GAME_DAY, createdById: superadmin.id },
    });
    console.log(`[seed-piloto] pelada criada: "${gameDay.title}"`);
  } else {
    console.log(`[seed-piloto] pelada ja existia: "${gameDay.title}" (nao alterada)`);
  }

  // Pagamento pendente e no local: o PIX exige comprovante, que nao existe aqui.
  // O organizador confirma na tela da pelada; quem esta pendente entra no sorteio.
  const participants = [superadmin, ...players];
  for (const participant of participants) {
    await prisma.registration.upsert({
      where: { gameDayId_userId: { gameDayId: gameDay.id, userId: participant.id } },
      update: {},
      create: {
        gameDayId: gameDay.id,
        userId: participant.id,
        paymentMethod: "ON_SITE",
        amountCents: gameDay.pricePerPlayerCents,
      },
    });
  }
  console.log(`[seed-piloto] ${participants.length} inscritos em "${gameDay.title}"`);

  // O organizador nao joga. A seed nunca o inscreve; se ele mesmo se inscreveu
  // depois, avisa em vez de apagar uma inscricao que e dele.
  const organizerRegistration = await prisma.registration.findUnique({
    where: { gameDayId_userId: { gameDayId: gameDay.id, userId: organizer.id } },
    select: { id: true },
  });
  if (organizerRegistration) {
    console.warn(`[seed-piloto] atencao: ${organizer.username} esta inscrito em "${gameDay.title}"`);
  }

  console.log("\n[seed-piloto] acessos (senhas provisorias, definidas neste arquivo):");
  console.log(`  ${superadmin.username} -> ${superadmin.role}`);
  console.log(`  ${organizer.username} -> ${organizer.role} (nao inscrito)`);
  console.log(`  demais ${players.length} -> USER`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("[seed-piloto] falhou", error);
    await prisma.$disconnect();
    process.exit(1);
  });
