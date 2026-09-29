import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { purgeDeadPasswordResetTokens } from "@/lib/auth/password-reset";
import { purgeDeadSessionTokens } from "@/lib/auth/session-store";

/**
 * Apaga os tokens de sessao que nenhum cookie consegue mais apresentar, e os
 * links de redefinicao de senha expirados ha mais de um dia.
 * Um usuario ativo gera ate ~96 linhas de sessao por dia (uma rotacao a cada
 * 15 min) e nada some sozinho. Roda no boot do container e pode ir para um cron
 * diario: npm run db:purge-sessions
 */
async function main() {
  const removedSessions = await purgeDeadSessionTokens();
  const removedResetTokens = await purgeDeadPasswordResetTokens();
  console.log(
    `[purge-sessions] ${removedSessions} tokens de sessao e ${removedResetTokens} links de redefinicao expirados removidos`,
  );
}

main()
  .catch((error) => {
    console.error("[purge-sessions] falhou", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
