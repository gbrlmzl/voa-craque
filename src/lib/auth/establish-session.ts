import { cookies } from "next/headers";
import { REFRESH_COOKIE_NAME } from "@/lib/auth/config";
import { issueRefreshToken, revokeRefreshFamily } from "@/lib/auth/refresh-tokens";
import { buildSessionCookies, expiredSessionCookies, type CookieWrite } from "@/lib/auth/session-cookies";

/**
 * So em Server Action e Route Handler: num Server Component o Next lanca em
 * cookies().set. Quem le a sessao (getCurrentUser) nunca grava cookie.
 */

async function writeCookies(writes: CookieWrite[]): Promise<void> {
  const jar = await cookies();
  for (const { name, value, options } of writes) jar.set(name, value, options);
}

/** Login, cadastro, Google e troca de senha: familia nova de refresh + access novo. */
export async function establishSession(userId: string): Promise<void> {
  const refreshToken = await issueRefreshToken(userId);
  await writeCookies(await buildSessionCookies({ userId, refreshToken }));
}

/**
 * Logout: revoga a familia do refresh deste navegador (LOGOUT) e apaga os dois
 * cookies. Le o refresh de cookies(), que ja traz o valor rotacionado pelo proxy
 * nesta mesma requisicao, se houve.
 */
export async function endSession(): Promise<void> {
  const raw = (await cookies()).get(REFRESH_COOKIE_NAME)?.value;
  if (raw) await revokeRefreshFamily(raw, "LOGOUT");
  await writeCookies(expiredSessionCookies());
}

/** So apaga os cookies deste navegador, sem revogar nada. */
export async function clearSessionCookies(): Promise<void> {
  await writeCookies(expiredSessionCookies());
}
