// O E2E nao le e-mail: cria o token de redefinicao pelas funcoes reais e devolve o link.
import { buildPasswordResetUrl, issuePasswordResetToken } from "@/lib/auth/password-reset";
import { prisma } from "@/lib/prisma";
import { assertE2eDatabase, reply } from "./guard";

assertE2eDatabase();
const email = process.argv[2];

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  const url = buildPasswordResetUrl(await issuePasswordResetToken(user.id));
  reply(url.pathname + url.search);
}

main().finally(() => prisma.$disconnect());
