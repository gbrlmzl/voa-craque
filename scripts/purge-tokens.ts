import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { purgeDeadPasswordResetTokens } from "@/lib/auth/password-reset";
import { purgeExpiredRefreshTokens } from "@/lib/auth/refresh-tokens";

/**
 * Apaga os refresh tokens expirados ou revogados ha mais de 30 dias (ate la eles
 * ainda reconhecem o reuso de um token roubado) e os links de redefinicao de
 * senha expirados ha mais de um dia.
 * O access token nao gera linha nenhuma, mas cada renovacao cria uma (um usuario
 * ativo passa de ~96 por dia) e nada some sozinho. Roda no boot do container e
 * pode ir para um cron diario: npm run db:purge-tokens
 */
async function purge<T>(label: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    // Uma falha nao impede a outra purga, mas o processo termina com erro.
    console.error(`[purge-tokens] ${label} falhou`, error);
    process.exitCode = 1;
    return null;
  }
}

async function main() {
  const refreshTokens = await purge("purga de refresh tokens", () => purgeExpiredRefreshTokens());
  const resetTokens = await purge("purga de links de redefinicao", () => purgeDeadPasswordResetTokens());
  console.log(`[purge-tokens] ${refreshTokens ?? 0} refresh tokens e ${resetTokens ?? 0} links de redefinicao removidos`);
}

main().finally(() => prisma.$disconnect());
