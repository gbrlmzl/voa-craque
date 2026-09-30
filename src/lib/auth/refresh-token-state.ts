import { createHash, randomBytes } from "node:crypto";
import type { RefreshTokenRevokeReason } from "@/generated/prisma/client";
import { REFRESH_GRACE_S, REFRESH_TOKEN_RETENTION_DAYS, REFRESH_TOKEN_TTL_S } from "@/lib/auth/config";

/**
 * Parte pura do refresh token: nada de Prisma em runtime (o import acima e so de
 * tipo), para os testes rodarem sem banco.
 */

/** 40 bytes aleatorios em hex, como na referencia: opaco, sem claim nenhum. */
export const newRawRefreshToken = (): string => randomBytes(40).toString("hex");

/** SHA-256, nao bcrypt: o valor ja e aleatorio de alta entropia. So o hash vai para o banco. */
export function hashRefreshToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export const refreshExpiresAt = (now: Date): Date => new Date(now.getTime() + REFRESH_TOKEN_TTL_S * 1000);

export const purgeCutoff = (now: Date): Date =>
  new Date(now.getTime() - REFRESH_TOKEN_RETENTION_DAYS * 24 * 60 * 60 * 1000);

/**
 * - active:  vivo e dentro do prazo
 * - grace:   aposentado por rotacao ha no maximo REFRESH_GRACE_S e a familia tem
 *            token vivo: requisicao concorrente, nao ataque
 * - reused:  aposentado por rotacao fora da graca (ou sem sucessor vivo): alguem
 *            guardou uma copia. Roubo confirmado
 * - revoked: revogado por logout, troca/redefinicao de senha, vinculo do Google
 *            ou reuso ja detectado: sessao encerrada, sem alarme
 * - expired: passou do prazo
 * - unknown: nao existe (lixo, ou linha ja purgada)
 */
export type RefreshTokenState = "active" | "grace" | "reused" | "revoked" | "expired" | "unknown";

export type RefreshTokenRow = {
  revokedAt: Date | null;
  revokedReason: RefreshTokenRevokeReason | null;
  expiresAt: Date;
};

export function withinGrace(revokedAt: Date, now: Date): boolean {
  return now.getTime() - revokedAt.getTime() <= REFRESH_GRACE_S * 1000;
}

/**
 * Graca so para quem foi aposentado por rotacao, e so se a familia tem sucessor
 * vivo: rotacao legitima deixa um; revogacao em massa nao deixa nenhum. Tempo
 * sozinho ressuscitaria por alguns segundos exatamente as sessoes que logout e
 * troca de senha existem para matar.
 */
export function classifyRefreshToken(
  row: RefreshTokenRow | null,
  hasLiveSuccessor: boolean,
  now: Date,
): RefreshTokenState {
  if (!row) return "unknown";
  if (row.revokedAt && row.revokedReason !== "ROTATED") return "revoked";
  if (row.revokedAt && !(withinGrace(row.revokedAt, now) && hasLiveSuccessor)) return "reused";
  if (row.expiresAt <= now) return "expired";
  return row.revokedAt ? "grace" : "active";
}
