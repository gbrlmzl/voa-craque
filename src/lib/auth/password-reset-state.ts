import { createHash } from "node:crypto";

/**
 * Parte pura da redefinicao de senha: nada de Prisma nem next/headers aqui, para
 * os testes rodarem sem banco (mesmo raciocinio de token-state.ts para a sessao).
 */

/** Uso unico, 30 minutos: tempo suficiente para abrir o e-mail, curto o bastante
 * para limitar o estrago de um link interceptado. */
export const PASSWORD_RESET_TTL_S = 30 * 60;

/** SHA-256, nao bcrypt: o valor ja e aleatorio de alta entropia (32 bytes), nao
 * uma senha escolhida por gente. So o hash fica no banco. */
export function hashResetToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export type ResetTokenState = "valid" | "used" | "expired" | "unknown";

export type ResetTokenRow = { usedAt: Date | null; expiresAt: Date };

/** `expiresAt <= now` conta como expirado: o limite exato nao e mais valido. */
export function classifyResetToken(row: ResetTokenRow | null, now: Date): ResetTokenState {
  if (!row) return "unknown";
  if (row.usedAt) return "used";
  return row.expiresAt > now ? "valid" : "expired";
}

/**
 * A URL do link sai sempre de AUTH_URL (ou NEXTAUTH_URL), nunca do host da
 * requisicao: um Host forjado nao consegue direcionar o link de redefinicao
 * para outro dominio.
 */
export function buildPasswordResetUrl(raw: string): URL {
  const base = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (!base) {
    throw new Error("AUTH_URL (ou NEXTAUTH_URL) precisa estar definida para montar o link de redefinicao de senha.");
  }
  const url = new URL("/reset-password", base);
  url.searchParams.set("token", raw);
  return url;
}
