import { NextResponse, type NextRequest } from "next/server";
import { REFRESH_COOKIE_NAME } from "@/lib/auth/config";
import { rotateRefreshToken } from "@/lib/auth/refresh-tokens";
import { buildSessionCookies, expiredSessionCookies, type CookieWrite } from "@/lib/auth/session-cookies";
import { clientIp } from "@/lib/client-ip";
import { refreshLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function withCookies<T extends NextResponse>(res: T, writes: CookieWrite[]): T {
  for (const { name, value, options } of writes) res.cookies.set(name, value, options);
  return res;
}

/**
 * Renovacao explicita da sessao: troca o refresh por um par novo de cookies.
 *
 * O navegador nao precisa chamar isto: o proxy renova sozinho quando o access
 * vence. Existe como na referencia, para clientes que nao passam pelo proxy e
 * para diagnostico. Fica sob /api/auth/*, que o proxy nao toca (aqui o
 * Set-Cookie e da propria rota).
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  const wait = refreshLimiter.retryAfter(ip);
  if (wait > 0) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente de novo em instantes." },
      { status: 429, headers: { "Retry-After": String(wait) } },
    );
  }
  refreshLimiter.hit(ip);

  const expired = () =>
    withCookies(
      NextResponse.json({ error: "Sessão expirada. Faça login novamente." }, { status: 401 }),
      expiredSessionCookies(),
    );

  const raw = req.cookies.get(REFRESH_COOKIE_NAME)?.value;
  if (!raw) return expired();

  const result = await rotateRefreshToken(raw, { ip });
  if (result.status !== "rotated") return expired();

  return withCookies(
    new NextResponse(null, { status: 204 }),
    await buildSessionCookies({ userId: result.userId, refreshToken: result.raw }),
  );
}
