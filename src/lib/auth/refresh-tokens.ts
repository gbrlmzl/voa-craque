import { randomUUID } from "node:crypto";
import type { RefreshTokenRevokeReason } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  classifyRefreshToken,
  hashRefreshToken,
  newRawRefreshToken,
  purgeCutoff,
  refreshExpiresAt,
  withinGrace,
  type RefreshTokenRow,
  type RefreshTokenState,
} from "@/lib/auth/refresh-token-state";
import type { AccessClaims } from "@/lib/auth/tokens";
import { logSecurityEvent } from "@/lib/security-log";

/**
 * Ciclo de vida do refresh token no banco. O valor e opaco (40 bytes hex) e so
 * existe dentro do cookie; aqui fica o SHA-256. Um dump do banco nao devolve
 * sessao a ninguem.
 *
 * Cada login abre uma familia (um aparelho). Cada rotacao aposenta o token com
 * `ROTATED` e cria o sucessor na mesma familia. Um token aposentado por rotacao
 * que volta fora da janela de graca e uma copia que alguem guardou: a familia
 * inteira cai. Os outros motivos de revogacao (logout, troca de senha...) nao
 * disparam alarme, so encerram a sessao.
 *
 * Quem rotaciona e o proxy (e /api/auth/refresh): sao os unicos pontos em que o
 * cookie novo consegue chegar ao navegador. Rotacionar durante o render de um
 * Server Component queimaria o token sem entregar o sucessor.
 */

type FamilyRow = RefreshTokenRow & { familyId: string };

/** Login em um aparelho: `familyId` novo. Devolve o valor puro, que vai so para o cookie. */
export async function issueRefreshToken(
  userId: string,
  familyId: string = randomUUID(),
  now = new Date(),
): Promise<string> {
  const raw = newRawRefreshToken();
  await prisma.refreshToken.create({
    data: { userId, familyId, tokenHash: hashRefreshToken(raw), expiresAt: refreshExpiresAt(now) },
  });
  return raw;
}

async function hasLiveSuccessor(familyId: string, now: Date): Promise<boolean> {
  const live = await prisma.refreshToken.findFirst({
    where: { familyId, revokedAt: null, expiresAt: { gt: now } },
    select: { id: true },
  });
  return live !== null;
}

/** Classifica uma linha ja carregada, com a consulta extra so quando ela pode mudar a resposta. */
async function resolveState(row: FamilyRow | null, now: Date): Promise<RefreshTokenState> {
  const successor =
    row?.revokedReason === "ROTATED" && row.revokedAt && withinGrace(row.revokedAt, now)
      ? await hasLiveSuccessor(row.familyId, now)
      : false;
  return classifyRefreshToken(row, successor, now);
}

export type RotateResult =
  /** `raw` e o sucessor, que vai para o cookie. */
  | { status: "rotated"; userId: string; raw: string }
  | { status: "invalid" };

/**
 * Troca o refresh por um sucessor na mesma familia. E aqui que o reuso e
 * detectado. Toda saida diferente de "rotated" significa que a sessao acabou.
 */
export async function rotateRefreshToken(
  raw: string,
  meta: { ip: string },
  now = new Date(),
): Promise<RotateResult> {
  const tokenHash = hashRefreshToken(raw);
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      familyId: true,
      revokedAt: true,
      revokedReason: true,
      expiresAt: true,
      user: { select: { active: true } },
    },
  });

  const state = await resolveState(row, now);
  const tokenHashPrefix = tokenHash.slice(0, 12);

  // Rotina (lixo, prazo vencido, linha ja purgada): sem log.
  if (!row || state === "unknown" || state === "expired") return { status: "invalid" };

  const { userId, familyId } = row;

  if (state === "revoked") {
    logSecurityEvent("refresh_token_revoked_use", {
      userId,
      familyId,
      reason: row.revokedReason,
      tokenHashPrefix,
      ip: meta.ip,
    });
    return { status: "invalid" };
  }

  if (state === "reused") {
    await prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now, revokedReason: "REUSE_DETECTED" },
    });
    logSecurityEvent("refresh_token_reuse", { userId, familyId, tokenHashPrefix, ip: meta.ip });
    return { status: "invalid" };
  }

  if (state === "grace") {
    logSecurityEvent("refresh_token_grace_reuse", { userId, familyId, tokenHashPrefix, ip: meta.ip });
  }

  // Antes de revogar qualquer coisa: revogar aqui deixaria a familia sem sucessor
  // vivo, e a proxima tentativa deste mesmo token seria lida como "reuso".
  if (!row.user.active) return { status: "invalid" };

  const next = newRawRefreshToken();
  const successor = prisma.refreshToken.create({
    data: { userId, familyId, tokenHash: hashRefreshToken(next), expiresAt: refreshExpiresAt(now) },
  });

  if (state === "active") {
    await prisma.$transaction([
      // `revokedAt: null` de proposito: nunca reescreva o revokedAt de um token ja
      // rotacionado, senao a janela de graca andaria para frente a cada
      // reapresentacao e um token roubado viveria para sempre.
      prisma.refreshToken.updateMany({
        where: { id: row.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: "ROTATED" },
      }),
      successor,
    ]);
  } else {
    // Em graca: o token ja foi aposentado por outra requisicao; so falta o sucessor.
    await successor;
  }

  return { status: "rotated", userId, raw: next };
}

/** Logout: derruba a familia inteira deste aparelho, inclusive sucessores criados na janela de graca. */
export async function revokeRefreshFamily(
  raw: string,
  reason: RefreshTokenRevokeReason,
  now = new Date(),
): Promise<void> {
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(raw) },
    select: { familyId: true },
  });
  if (!row) return;
  await prisma.refreshToken.updateMany({
    where: { familyId: row.familyId, revokedAt: null },
    data: { revokedAt: now, revokedReason: reason },
  });
}

/** Troca e redefinicao de senha: nenhuma sessao existente continua confiavel. */
export async function revokeAllUserRefreshTokens(
  userId: string,
  reason: RefreshTokenRevokeReason,
  now = new Date(),
): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now, revokedReason: reason },
  });
}

/**
 * So para o proxy, em GET de rota so-de-deslogado: o access ainda verifica, mas
 * a sessao por tras dele ja acabou? Sem esta conferencia, depois de uma
 * redefinicao de senha ou de uma desativacao, um access ainda valido faria
 * /login mandar para "/" e a pagina mandar de volta para /login, sem fim.
 */
export async function isSessionAlive(access: AccessClaims, refreshRaw: string | undefined): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: access.sub }, select: { active: true } });
  if (!user?.active) return false;
  if (!refreshRaw) return true;

  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(refreshRaw) },
    select: { familyId: true, revokedAt: true, revokedReason: true, expiresAt: true },
  });
  const state = await resolveState(row, new Date());
  return state === "active" || state === "grace";
}

/**
 * Remove as linhas que nenhum cookie consegue mais apresentar. Revogadas ou
 * expiradas ficam REFRESH_TOKEN_RETENTION_DAYS antes de sair: enquanto existem,
 * reconhecem o reuso de um token roubado.
 */
export async function purgeExpiredRefreshTokens(now = new Date()): Promise<number> {
  const cutoff = purgeCutoff(now);
  const { count } = await prisma.refreshToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
  });
  return count;
}
