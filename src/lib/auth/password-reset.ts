import { randomBytes } from "node:crypto";
import type { Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { classifyResetToken, hashResetToken, PASSWORD_RESET_TTL_S } from "@/lib/auth/password-reset-state";

export { PASSWORD_RESET_TTL_S, buildPasswordResetUrl, hashResetToken, classifyResetToken } from "@/lib/auth/password-reset-state";

const newRawToken = (): string => randomBytes(32).toString("base64url");
const expiresFrom = (now: Date): Date => new Date(now.getTime() + PASSWORD_RESET_TTL_S * 1000);

/**
 * Pedido de link novo: invalida os pendentes do usuario (um link novo aposenta
 * os anteriores) e cria um token. O valor puro so vai para o e-mail; o banco so
 * guarda o hash.
 */
export async function issuePasswordResetToken(userId: string): Promise<string> {
  const now = new Date();
  const raw = newRawToken();
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } }),
    prisma.passwordResetToken.create({
      data: { userId, tokenHash: hashResetToken(raw), expiresAt: expiresFrom(now) },
    }),
  ]);
  return raw;
}

/**
 * So leitura: usado pela pagina para decidir se mostra o formulario. Antivirus e
 * previews de e-mail abrem o link com GET; consumir o token aqui queimaria o
 * link antes da pessoa clicar de verdade.
 */
export async function findUsableResetToken(raw: string): Promise<{ userId: string } | null> {
  const now = new Date();
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(raw) },
    select: { usedAt: true, expiresAt: true, user: { select: { id: true, active: true, passwordHash: true } } },
  });
  if (!row || classifyResetToken(row, now) !== "valid" || !row.user.active || !row.user.passwordHash) return null;
  return { userId: row.user.id };
}

export type ResetPasswordFailureReason = "unknown" | "used" | "expired" | "inactive" | "no_local_password";

export type ResetPasswordResult =
  | { ok: true; user: { id: string; username: string; email: string; role: Role } }
  | { ok: false; reason: ResetPasswordFailureReason };

/** Consome o token e troca a senha de forma atomica; revoga todas as sessoes do usuario. */
export async function resetPasswordWithToken(raw: string, newPassword: string): Promise<ResetPasswordResult> {
  const now = new Date();
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(raw) },
    select: {
      id: true,
      usedAt: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          active: true,
          passwordHash: true,
          emailVerifiedAt: true,
        },
      },
    },
  });

  const state = classifyResetToken(row, now);
  if (!row) return { ok: false, reason: "unknown" };
  if (state !== "valid") return { ok: false, reason: state };
  const { user } = row;
  if (!user.active) return { ok: false, reason: "inactive" };
  if (!user.passwordHash) return { ok: false, reason: "no_local_password" };

  const passwordHash = await hashPassword(newPassword);
  const done = await prisma.$transaction(async (tx) => {
    // Condicional: dois envios simultaneos do mesmo link, so um troca a senha.
    const { count } = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count !== 1) return false;

    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? now },
    });
    await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
    await tx.sessionToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
    return true;
  });

  if (!done) return { ok: false, reason: "used" };
  return { ok: true, user: { id: user.id, username: user.username, email: user.email, role: user.role } };
}

/** Apaga os tokens expirados ha mais de um dia; chamado tambem por scripts/purge-sessions.ts. */
export async function purgeDeadPasswordResetTokens(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const { count } = await prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });
  return count;
}
