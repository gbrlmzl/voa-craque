/**
 * Constantes da sessao, sem Prisma nem bcrypt: este modulo e lido pelo proxy,
 * pelas actions, pelos route handlers e pelos testes. Mudar um numero aqui muda
 * o comportamento de todos ao mesmo tempo, que e exatamente o ponto.
 *
 * Dois cookies: o de sessao (access token, JWT de vida curta, nada no banco) e
 * o de refresh (opaco, vida longa, hash no banco). Ver docs/arquitetura-sessao-jwt.md.
 */

/** Vida do cookie de sessao (access token). Tambem e o Max-Age do cookie. */
export const ACCESS_TOKEN_TTL_S = 15 * 60;

/** Vida do refresh token. Cada rotacao cria o sucessor com o prazo cheio. */
export const REFRESH_TOKEN_TTL_S = 7 * 24 * 60 * 60;

/**
 * Por quanto tempo, depois de rotacionado, um refresh ainda e aceito de novo em
 * vez de ser lido como roubo: requisicoes paralelas (abas, fetch do cliente)
 * saem com o mesmo token antes de qualquer uma ver o Set-Cookie das outras.
 * Mesmo valor da referencia (e do OAuth 2.0 Security BCP para clientes concorrentes).
 */
export const REFRESH_GRACE_S = 10;

/**
 * Linhas revogadas ou expiradas ficam este tempo antes da purga: enquanto
 * existirem, reconhecem o reuso de um token roubado.
 */
export const REFRESH_TOKEN_RETENTION_DAYS = 30;

/**
 * O proxy renova quando falta menos que isto para o access expirar: uma Server
 * Action com upload passa pelo proxy no inicio e so le o access no fim.
 */
export const ACCESS_REFRESH_MARGIN_S = 60;

/** Janela do handshake com o Google (state + PKCE). */
export const OAUTH_STATE_TTL_S = 10 * 60;

/**
 * `Secure` so quando a aplicacao e servida por https. Em producao o padrao e
 * seguro, a menos que AUTH_URL diga explicitamente http (o compose local roda
 * `next start` em http://localhost:3000).
 */
function useSecureCookies(): boolean {
  const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
  if (url.startsWith("https://")) return true;
  if (url.startsWith("http://")) return false;
  return process.env.NODE_ENV === "production";
}

export const SECURE_COOKIES = useSecureCookies();

// __Host- exige Secure, Path=/ e nenhum Domain: um subdominio nao consegue
// plantar o cookie. Em http (dev local) o navegador recusaria o prefixo.
const COOKIE_PREFIX = SECURE_COOKIES ? "__Host-" : "";
export const ACCESS_COOKIE_NAME = `${COOKIE_PREFIX}voacraque.session`;
export const REFRESH_COOKIE_NAME = `${COOKIE_PREFIX}voacraque.refresh`;
export const OAUTH_COOKIE_NAME = `${COOKIE_PREFIX}voacraque.oauth`;

export const COOKIE_BASE_OPTIONS = {
  httpOnly: true,
  // lax, nao strict: o retorno do Google chega por navegacao de topo vinda de
  // outro site, e com strict o navegador descartaria os cookies.
  sameSite: "lax" as const,
  path: "/",
  secure: SECURE_COOKIES,
};

export function isGoogleAuthEnabled(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}
