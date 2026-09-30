import {
  ACCESS_COOKIE_NAME,
  ACCESS_TOKEN_TTL_S,
  COOKIE_BASE_OPTIONS,
  REFRESH_COOKIE_NAME,
  REFRESH_TOKEN_TTL_S,
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
  options: typeof COOKIE_BASE_OPTIONS & { maxAge: number };
};

/** Access recem-assinado + o refresh opaco que o acompanha. */
export async function buildSessionCookies(
  { userId, refreshToken }: { userId: string; refreshToken: string },
  now = new Date(),
): Promise<CookieWrite[]> {
  return [
    {
      name: ACCESS_COOKIE_NAME,
      value: await signAccessToken(userId, now),
      options: { ...COOKIE_BASE_OPTIONS, maxAge: ACCESS_TOKEN_TTL_S },
    },
    {
      name: REFRESH_COOKIE_NAME,
      value: refreshToken,
      options: { ...COOKIE_BASE_OPTIONS, maxAge: REFRESH_TOKEN_TTL_S },
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
