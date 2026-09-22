import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS, SESSION_IDLE_TTL_S } from "@/lib/auth/config";
import { classifyPath, type RouteKind } from "@/lib/auth/routes";
import { needsRotation, nowSeconds, readSessionCookie, writeSessionCookie } from "@/lib/auth/session-cookie";
import { acknowledgeSessionToken, isSessionAlive, rotateSessionToken } from "@/lib/auth/session-store";
import { clientIp } from "@/lib/client-ip";

/**
 * Roda antes de toda pagina, rota de API e Server Action. Tem dois papeis:
 *
 * 1. Guarda de rota, por heuristica: "tem cookie de sessao que decifra?".
 *    Nao e autoridade; quem responde "essa sessao vale?" e getCurrentUser(),
 *    em cada pagina e rota. O proxy sozinho nao protege nada.
 *
 * 2. O UNICO lugar que rotaciona o token de sessao, porque e o unico ponto do
 *    fluxo que sempre consegue gravar cookie no navegador. Rotacionar durante o
 *    render de um Server Component emitiria um token que nunca chegaria ao
 *    navegador.
 *
 * A rotacao tem dois tempos (ver session-store.ts): emitir um sucessor pendente
 * e, quando o navegador o devolve, confirmar e aposentar o anterior.
 *
 * Toca no banco em tres casos so: token passou de SESSION_ROTATE_AFTER_S, cookie
 * de sucessor voltando pela primeira vez, e alguem com cookie abrindo /login ou
 * /registrar.
 */
export async function proxy(req: NextRequest) {
  const route = classifyPath(req.nextUrl.pathname);
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  let claims = await readSessionCookie(cookie);
  let renewed: string | null = null;
  // Cookie que nem decifra (adulterado, expirado, segredo trocado) sai do navegador.
  let clear = Boolean(cookie) && !claims;

  if (claims && canRotate(req, route) && (claims.pend || needsRotation(claims))) {
    const meta = { ip: clientIp(req.headers) };
    const result = claims.pend
      ? await acknowledgeSessionToken(claims.sid, meta)
      : await rotateSessionToken(claims.sid, meta);

    if (result.status === "rotated") {
      // O token atual continua valendo ate o navegador devolver este; o Next ja
      // repassa o Set-Cookie ao cookies() do render, sem reescrever o request.
      renewed = await writeSessionCookie({ sub: claims.sub, sid: result.raw, rot: nowSeconds(), pend: true });
    } else if (result.status === "acknowledged") {
      renewed = await writeSessionCookie({ sub: claims.sub, sid: claims.sid, rot: claims.rot });
    } else if (result.status === "invalid") {
      claims = null;
      clear = true;
    }
    // "grace": requisicao em voo, ou o sucessor ja esta a caminho pela resposta de outra.
  }

  // Um cookie que decifra pode apontar para uma sessao ja revogada (logout em
  // outra aba, reuso detectado). Sem esta checagem: /login manda para "/", a
  // pagina ve sessao morta e manda para /login, e o ciclo nao termina.
  if (claims && !renewed && route === "guest-only" && req.method === "GET" && !(await isSessionAlive(claims.sid))) {
    claims = null;
    clear = true;
  }

  if (!claims && route === "protected-api") {
    return withSessionCookie(NextResponse.json({ error: "Faça login para continuar." }, { status: 401 }), null, clear);
  }

  if (!claims && route === "protected-page") {
    const url = new URL("/login", req.nextUrl);
    const next = req.nextUrl.pathname + req.nextUrl.search;
    if (next !== "/") url.searchParams.set("proximo", next);
    return withSessionCookie(NextResponse.redirect(url), null, clear);
  }

  // So GET: um POST aqui e a Server Action de login de uma aba antiga, e
  // redirecionar a action quebraria a resposta que ela espera.
  if (claims && route === "guest-only" && req.method === "GET") {
    return withSessionCookie(NextResponse.redirect(new URL("/", req.nextUrl)), renewed, clear);
  }

  return withSessionCookie(NextResponse.next(), renewed, clear);
}

/**
 * Rotaciona e confirma so em GET fora das rotas do Auth.js (o sucessor
 * pendente e aceito normalmente enquanto isso):
 * - o callback do Google grava o proprio cookie de sessao;
 * - Server Actions (login, logout) reescrevem o cookie, e dois Set-Cookie com o
 *   mesmo nome na mesma resposta nao tem ordem garantida;
 * - um upload lento pode chegar ao proxy muito depois de sair do navegador,
 *   quando o token que ele carrega ja foi aposentado.
 * Prefetch do router nem chega aqui (ver `missing` no matcher); o speculative
 * prefetch do navegador e barrado pelos headers abaixo.
 */
function canRotate(req: NextRequest, route: RouteKind): boolean {
  if (req.method !== "GET" || route === "auth-endpoint") return false;
  const purpose = `${req.headers.get("purpose") ?? ""} ${req.headers.get("sec-purpose") ?? ""}`;
  return !purpose.includes("prefetch");
}

function withSessionCookie<T extends NextResponse>(res: T, renewed: string | null, clear: boolean): T {
  if (renewed) {
    res.cookies.set(SESSION_COOKIE_NAME, renewed, { ...SESSION_COOKIE_OPTIONS, maxAge: SESSION_IDLE_TTL_S });
  } else if (clear) {
    // Com os mesmos atributos: um cookie __Secure- so e apagado com `secure`.
    res.cookies.set(SESSION_COOKIE_NAME, "", { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
  }
  return res;
}

export const config = {
  matcher: [
    {
      // `_next/` inteiro, e nao so static/image: o WebSocket do hot-reload
      // (/_next/hmr) caia aqui como pagina protegida e era redirecionado para
      // /login, e o hot-reload parava de funcionar para quem estava deslogado.
      source: "/((?!_next/|favicon.ico|icon.svg|manifest.webmanifest).*)",
      // O Next remove `next-router-prefetch` (e os outros headers do router) do
      // request que o proxy recebe; so o matcher ainda consegue ve-lo. Prefetch
      // traz no maximo a casca ate o loading.tsx, e a guarda da pagina roda na
      // navegacao de verdade.
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
