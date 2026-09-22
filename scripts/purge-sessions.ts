import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { purgeDeadSessionTokens } from "@/lib/auth/session-store";

/**
 * Apaga os tokens de sessao que nenhum cookie consegue mais apresentar.
 * Um usuario ativo gera ate ~96 linhas por dia (uma rotacao a cada 15 min) e
 * nada some sozinho. Roda no boot do container e pode ir para um cron diario:
 *   npm run db:purge-sessions
 */
async function main() {
  const removed = await purgeDeadSessionTokens();
  console.log(`[purge-sessions] ${removed} tokens expirados removidos`);
}

main()
  .catch((error) => {
    console.error("[purge-sessions] falhou", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
