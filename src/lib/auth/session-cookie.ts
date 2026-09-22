import { decode, encode } from "next-auth/jwt";
import { SESSION_COOKIE_NAME, SESSION_IDLE_TTL_S, SESSION_ROTATE_AFTER_S } from "@/lib/auth/config";

/**
 * O que vai dentro do cookie de sessao. O cookie e o JWE do Auth.js (cifrado,
 * nao so assinado, com chave derivada do AUTH_SECRET), entao o navegador nao
 * le nada disso, e o proxy consegue validar de verdade: o segredo mora no
 * mesmo processo.
 *
 * - sub:  id do usuario
 * - sid:  token de sessao em texto puro; no banco so existe o hash
 * - rot:  quando este sid foi emitido (epoch em segundos)
 * - pend: o sid e um sucessor que o navegador ainda nao confirmou ter recebido.
 *         Quando um cookie com `pend` volta ao proxy, essa e a confirmacao.
 */
export type SessionClaims = { sub: string; sid: string; rot: number; pend?: true };

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/** Mesma lista, na mesma ordem, que o Auth.js monta: cifra com o primeiro, decifra com qualquer um. */
function secrets(): string[] {
  const list: string[] = [];
  if (process.env.AUTH_SECRET) list.push(process.env.AUTH_SECRET);
  for (const i of [1, 2, 3]) {
    const secret = process.env[`AUTH_SECRET_${i}`];
    if (secret) list.unshift(secret);
  }
  return list;
}

export async function readSessionCookie(value: string | undefined): Promise<SessionClaims | null> {
  if (!value) return null;
  try {
    const payload = await decode({ token: value, secret: secrets(), salt: SESSION_COOKIE_NAME });
    if (
      !payload ||
      typeof payload.sub !== "string" ||
      typeof payload.sid !== "string" ||
      typeof payload.rot !== "number"
    ) {
      return null;
    }
    const claims: SessionClaims = { sub: payload.sub, sid: payload.sid, rot: payload.rot };
    if (payload.pend === true) claims.pend = true;
    return claims;
  } catch {
    // Cookie adulterado, expirado ou cifrado com um segredo que saiu de uso.
    return null;
  }
}

export function writeSessionCookie(claims: SessionClaims): Promise<string> {
  return encode({ token: claims, secret: secrets(), salt: SESSION_COOKIE_NAME, maxAge: SESSION_IDLE_TTL_S });
}

export function needsRotation(claims: SessionClaims, now = nowSeconds()): boolean {
  return now - claims.rot >= SESSION_ROTATE_AFTER_S;
}
