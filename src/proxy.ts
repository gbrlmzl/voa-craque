import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from "@/lib/auth/config";
import { isSessionAlive, rotateRefreshToken } from "@/lib/auth/refresh-tokens";
import { classifyPath, type RouteKind } from "@/lib/auth/routes";
import { buildSessionCookies, expiredSessionCookies, type CookieWrite } from "@/lib/auth/session-cookies";
import { needsRefresh, verifyAccessToken } from "@/lib/auth/tokens";
import { clientIp } from "@/lib/client-ip";

/**
 * Roda antes de toda pagina, rota de API e Server Action. Tem dois papeis:
 *
 * 1. Guarda de rota, por heuristica: "tem access token que verifica?". Nao e
 *    autoridade; quem responde "essa sessao vale?" e getCurrentUser(), em cada
 *    pagina e rota. O proxy sozinho nao protege nada.
 *
 * 2. O UNICO lugar que renova a sessao (junto com as actions de auth e /api/auth/*),
 *    porque e o unico ponto do fluxo que sempre consegue gravar cookie no
 *    navegador. Renovar durante o render de um Server Component emitiria um
 *    refresh que nunca chegaria ao navegador e queimaria o token.
 *
 * Como na referencia (sistema-controle-despesas), so renova quando o access falta
 * ou esta vencendo, nunca a cada requisicao. Toca no banco em dois casos: nessa
 * renovacao (troca o refresh por um par novo) e em GET de rota so-de-deslogado
 * (confere se a sessao por tras do access ainda vive).
 */
export async function proxy(req: NextRequest) {
  const route = classifyPath(req.nextUrl.pathname);
  // Callback do Google e /api/auth/refresh gravam os proprios cookies.
  if (route === "auth-endpoint") return NextResponse.next();

  const accessCookie = req.cookies.get(ACCESS_COOKIE_NAME)?.value;
  const refreshCookie = req.cookies.get(REFRESH_COOKIE_NAME)?.value;

  const access = await verifyAccessToken(accessCookie);
  let authenticated = access !== null;
  let renewed: CookieWrite[] | null = null;
  // Access que nao verifica e nenhum refresh para socorrer: sai do navegador.
  let clear = Boolean(accessCookie) && !access && !refreshCookie;

  // Como na referencia: so renova quando o access falta ou esta vencendo, nunca
  // a cada requisicao.
  if (refreshCookie && needsRefresh(access) && canRenew(req, route)) {
    try {
      const result = await rotateRefreshToken(refreshCookie, { ip: clientIp(req.headers) });
      if (result.status === "rotated") {
        // O Next repassa estes Set-Cookie ao cookies() do render, do handler e
        // da Server Action desta mesma requisicao.
        renewed = await buildSessionCookies({ userId: result.userId, refreshToken: result.raw });
        authenticated = true;
      } else {
        // Refresh expirado, desconhecido, revogado ou reusado: a sessao acabou.
        authenticated = false;
        clear = true;
      }
    } catch (error) {
      // Banco fora do ar nao desloga ninguem: segue com o que o access diz.
      console.error("[auth] falha ao renovar a sessao no proxy", error);
    }
  }

  // Um access que verifica pode pertencer a uma sessao ja encerrada (senha
  // redefinida, conta desativada). Sem esta checagem: /login manda para "/", a
  // pagina ve sessao morta e manda para /login, e o ciclo nao termina.
  if (
    authenticated &&
    !renewed &&
    access &&
    route === "guest-only" &&
    req.method === "GET" &&
    !(await isSessionAlive(access, refreshCookie))
  ) {
    authenticated = false;
    clear = true;
  }

  if (!authenticated && route === "protected-api") {
    return withSessionCookies(NextResponse.json({ error: "Faça login para continuar." }, { status: 401 }), null, clear);
  }

  if (!authenticated && route === "protected-page") {
    const url = new URL("/login", req.nextUrl);
    const next = req.nextUrl.pathname + req.nextUrl.search;
    if (next !== "/") url.searchParams.set("proximo", next);
    return withSessionCookies(NextResponse.redirect(url), null, clear);
  }

  // So GET: um POST aqui e a Server Action de login de uma aba antiga, e
  // redirecionar a action quebraria a resposta que ela espera.
  if (authenticated && route === "guest-only" && req.method === "GET") {
    return withSessionCookies(NextResponse.redirect(new URL("/", req.nextUrl)), renewed, clear);
  }

  return withSessionCookies(nextWithSession(req, renewed, clear), renewed, clear);
}

/**
 * Segue para a pagina, rota ou action ja com a sessao renovada (ou apagada) nos
 * cookies da REQUISICAO, nao so nos da resposta. O Next mescla o Set-Cookie do
 * proxy no `cookies()` do render e das actions, mas nao no dos route handlers
 * (`x-middleware-set-cookie` so e lido de IncomingMessage; o handler recebe uma
 * NextRequest). Sem isto, a primeira chamada de /api/* depois do access vencer
 * renovaria a sessao e ainda assim responderia 401.
 */
function nextWithSession(req: NextRequest, renewed: CookieWrite[] | null, clear: boolean): NextResponse {
  const writes = renewed ?? (clear ? expiredSessionCookies() : []);
  if (writes.length === 0) return NextResponse.next();

  for (const { name, value, options } of writes) {
    if (options.maxAge === 0) req.cookies.delete(name);
    else req.cookies.set(name, value);
  }
  return NextResponse.next({ request: { headers: req.headers } });
}

/**
 * Renova em pagina, rota de API e Server Action, menos:
 * - POST em rota so-de-deslogado: e a Server Action de login, cadastro ou Google
 *   de uma aba antiga, que nao precisa de sessao. Se ela gravar cookie (o state do
 *   Google, por exemplo), o Set-Cookie dela substitui o daqui e o navegador fica
 *   com o refresh ja rotacionado, que a proxima renovacao leria como reuso;
 * - prefetch especulativo do navegador: rotacionaria para uma resposta que
 *   talvez nunca seja usada. (Prefetch do router nem chega aqui: ver matcher.)
 */
function canRenew(req: NextRequest, route: RouteKind): boolean {
  if (route === "guest-only" && req.method !== "GET") return false;
  const purpose = `${req.headers.get("purpose") ?? ""} ${req.headers.get("sec-purpose") ?? ""}`;
  return !purpose.includes("prefetch");
}

function withSessionCookies<T extends NextResponse>(res: T, renewed: CookieWrite[] | null, clear: boolean): T {
  const writes = renewed ?? (clear ? expiredSessionCookies() : []);
  for (const { name, value, options } of writes) res.cookies.set(name, value, options);
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
