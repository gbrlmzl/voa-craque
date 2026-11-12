// Cookies de uma sessao valida, emitidos pelas funcoes reais de src/lib/auth, sem passar pelo
// formulario (e sem gastar o limite de tentativas de login).
import { issueRefreshToken } from "@/lib/auth/refresh-tokens";
import { buildSessionCookies } from "@/lib/auth/session-cookies";
import { prisma } from "@/lib/prisma";
import { assertE2eDatabase, reply } from "./guard";

assertE2eDatabase();
const username = process.argv[2];

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { username }, select: { id: true } });
  const refreshToken = await issueRefreshToken(user.id, { persistent: true });
  reply(await buildSessionCookies({ userId: user.id, refreshToken, persistent: true }));
}

main().finally(() => prisma.$disconnect());
