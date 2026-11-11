import { cookies } from "next/headers";
import { REFRESH_COOKIE_NAME } from "@/lib/auth/config";
import { isPersistentRefresh, issueRefreshToken, revokeRefreshFamily } from "@/lib/auth/refresh-tokens";
import { buildSessionCookies, expiredSessionCookies, type CookieWrite } from "@/lib/auth/session-cookies";

/**
 * So em Server Action e Route Handler: num Server Component o Next lanca em
 * cookies().set. Quem le a sessao (getCurrentUser) nunca grava cookie.
 */

async function writeCookies(writes: CookieWrite[]): Promise<void> {
  const jar = await cookies();
  for (const { name, value, options } of writes) jar.set(name, value, options);
}

/**
 * Login, cadastro, Google e troca de senha: familia nova de refresh + access novo.
 * `persistent` e a escolha "manter login": cookies de 30 dias em vez de cookies de sessao.
 */
export async function establishSession(userId: string, { persistent }: { persistent: boolean }): Promise<void> {
  const refreshToken = await issueRefreshToken(userId, { persistent });
  await writeCookies(await buildSessionCookies({ userId, refreshToken, persistent }));
}

/** A sessao deste navegador foi aberta com "manter login"? Para a troca de senha nao mudar a escolha. */
export async function currentSessionIsPersistent(): Promise<boolean> {
  return isPersistentRefresh((await cookies()).get(REFRESH_COOKIE_NAME)?.value);
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
