import { hkdfSync } from "node:crypto";
import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import { ACCESS_REFRESH_MARGIN_S, ACCESS_TOKEN_TTL_S, OAUTH_STATE_TTL_S } from "@/lib/auth/config";

/**
 * Emissao e verificacao dos JWT: o access token (cookie de sessao) e o state do
 * handshake com o Google. Puro (sem Prisma nem next/headers): o proxy, as
 * actions, os route handlers e os testes usam o mesmo codigo. O refresh token
 * nao e JWT: e opaco e mora no banco (ver refresh-tokens.ts).
 *
 * HS256 assinado, nao cifrado: o claim (id do usuario) nao e segredo e o cookie
 * e httpOnly. `iss` e `aud` sao exigidos na verificacao, e cada finalidade tem a
 * propria chave derivada do AUTH_SECRET.
 */

const ISSUER = "voacraque";
const MIN_SECRET_LENGTH = 32;

type Purpose = "access" | "oauth";

const AUDIENCE: Record<Purpose, string> = {
  access: "voacraque:access",
  oauth: "voacraque:oauth",
};

/** Assina com AUTH_SECRET; verifica com ele e com AUTH_SECRET_1..3 (segredos antigos durante a troca). */
function secrets(): string[] {
  const current = process.env.AUTH_SECRET ?? "";
  if (current.length < MIN_SECRET_LENGTH) {
    throw new Error(`AUTH_SECRET precisa ter pelo menos ${MIN_SECRET_LENGTH} caracteres.`);
  }
  const previous = [1, 2, 3]
    .map((i) => process.env[`AUTH_SECRET_${i}`])
    .filter((secret): secret is string => Boolean(secret));
  return [current, ...previous];
}

function keyFor(secret: string, purpose: Purpose): Uint8Array {
  return new Uint8Array(hkdfSync("sha256", secret, ISSUER, `voacraque ${purpose} token`, 32));
}

const epochSeconds = (date: Date): number => Math.floor(date.getTime() / 1000);

async function sign(purpose: Purpose, subject: string, claims: JWTPayload, ttlS: number, now: Date): Promise<string> {
  const issuedAt = epochSeconds(now);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE[purpose])
    .setSubject(subject)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ttlS)
    .sign(keyFor(secrets()[0], purpose));
}

async function verify(purpose: Purpose, token: string | undefined, now: Date): Promise<JWTPayload | null> {
  if (!token) return null;
  for (const secret of secrets()) {
    try {
      const { payload } = await jwtVerify(token, keyFor(secret, purpose), {
        algorithms: ["HS256"],
        issuer: ISSUER,
        audience: AUDIENCE[purpose],
        currentDate: now,
      });
      return payload;
    } catch {
      // Outro segredo, expirado, adulterado ou lixo: tenta o proximo segredo.
    }
  }
  return null;
}

/** sub: id do usuario; exp: epoch em segundos. */
export type AccessClaims = { sub: string; exp: number };

export function signAccessToken(userId: string, now = new Date()): Promise<string> {
  return sign("access", userId, {}, ACCESS_TOKEN_TTL_S, now);
}

export async function verifyAccessToken(token: string | undefined, now = new Date()): Promise<AccessClaims | null> {
  const payload = await verify("access", token, now);
  if (!payload || typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
  return { sub: payload.sub, exp: payload.exp };
}

/** Sem access valido, ou com menos de ACCESS_REFRESH_MARGIN_S de vida: hora de renovar. */
export function needsRefresh(access: AccessClaims | null, now = new Date()): boolean {
  return access === null || access.exp - epochSeconds(now) < ACCESS_REFRESH_MARGIN_S;
}

/** O que o navegador guarda entre a ida ao Google e a volta. */
export type OAuthState = { state: string; codeVerifier: string; next: string };

export function signOAuthState(value: OAuthState, now = new Date()): Promise<string> {
  return sign("oauth", "google", { ...value }, OAUTH_STATE_TTL_S, now);
}

export async function verifyOAuthState(token: string | undefined, now = new Date()): Promise<OAuthState | null> {
  const payload = await verify("oauth", token, now);
  if (
    !payload ||
    typeof payload.state !== "string" ||
    typeof payload.codeVerifier !== "string" ||
    typeof payload.next !== "string"
  ) {
    return null;
  }
  return { state: payload.state, codeVerifier: payload.codeVerifier, next: payload.next };
}
