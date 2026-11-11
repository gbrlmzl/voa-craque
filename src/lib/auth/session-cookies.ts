import {
  ACCESS_COOKIE_NAME,
  ACCESS_TOKEN_TTL_S,
  COOKIE_BASE_OPTIONS,
  REFRESH_COOKIE_NAME,
  REFRESH_TOKEN_TTL_PERSISTENT_S,
} from "@/lib/auth/config";
import { signAccessToken } from "@/lib/auth/tokens";

/**
 * Os dois cookies de sessao como dados. O mesmo formato serve ao proxy
 * (`NextResponse.cookies.set`) e as actions e route handlers (`cookies().set`),
 * entao nenhum dos dois repete nome, validade ou atributo. Puro: sem Prisma nem
 * next/headers.
 */
export type CookieWrite = {
  name: string;
  value: string;
  /** Sem `maxAge` o cookie e de sessao: o navegador o descarta ao fechar. */
  options: typeof COOKIE_BASE_OPTIONS & { maxAge?: number };
};

/**
 * Access recem-assinado + o refresh opaco que o acompanha.
 *
 * `persistent` ("manter login"): os cookies sobrevivem ao navegador fechado (o
 * refresh por 30 dias, o access pelos seus 15 min). Sem ele nenhum dos dois leva
 * Max-Age: fechar o navegador encerra a sessao.
 */
export async function buildSessionCookies(
  { userId, refreshToken, persistent }: { userId: string; refreshToken: string; persistent: boolean },
  now = new Date(),
): Promise<CookieWrite[]> {
  return [
    {
      name: ACCESS_COOKIE_NAME,
      value: await signAccessToken(userId, now),
      options: persistent ? { ...COOKIE_BASE_OPTIONS, maxAge: ACCESS_TOKEN_TTL_S } : { ...COOKIE_BASE_OPTIONS },
    },
    {
      name: REFRESH_COOKIE_NAME,
      value: refreshToken,
      options: persistent
        ? { ...COOKIE_BASE_OPTIONS, maxAge: REFRESH_TOKEN_TTL_PERSISTENT_S }
        : { ...COOKIE_BASE_OPTIONS },
    },
  ];
}

/**
 * Apaga os dois. Com os mesmos atributos da criacao: um cookie __Host- so e
 * apagado com `secure` e `path: "/"`, senao o navegador ignora o Set-Cookie.
 */
export function expiredSessionCookies(): CookieWrite[] {
  return [ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME].map((name) => ({
    name,
    value: "",
    options: { ...COOKIE_BASE_OPTIONS, maxAge: 0 },
  }));
}
