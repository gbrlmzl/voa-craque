/**
 * Constantes da sessao, sem Prisma nem bcrypt: este modulo e lido pelo proxy,
 * pelo Auth.js e pelos testes. Mudar um numero aqui muda o comportamento dos
 * tres ao mesmo tempo, que e exatamente o ponto.
 */

/** Inatividade maxima. Cada rotacao empurra o prazo para frente. */
export const SESSION_IDLE_TTL_S = 60 * 60 * 24 * 30;

/**
 * De quanto em quanto tempo o proxy troca o token de sessao. Faz o papel do
 * TTL do access token: dentro dessa janela o proxy nao toca no banco.
 */
export const SESSION_ROTATE_AFTER_S = 60 * 15;

/**
 * Dois usos, a mesma ideia de "requisicao ainda em transito":
 * - por quanto tempo um token recem-aposentado ainda e aceito, desde que a
 *   familia tenha um token vivo: requisicoes que ja estavam em voo quando o
 *   sucessor foi usado pela primeira vez (abas em paralelo, uploads lentos);
 * - por quanto tempo um sucessor recem-emitido e considerado "a caminho" antes
 *   de ser dado como perdido e trocado por outro.
 * E maior que os 10 s tipicos de uma API externa porque aqui o mesmo token
 * autentica cada requisicao, nao so a renovacao.
 */
export const SESSION_GRACE_S = 60;

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

/** Mesmo nome que o Auth.js usaria sozinho; fixado para o proxy concordar com ele. */
export const SESSION_COOKIE_NAME = `${SECURE_COOKIES ? "__Secure-" : ""}authjs.session-token`;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  // lax, nao strict: o retorno do Google chega por navegacao de topo vinda de
  // outro site, e com strict o navegador descartaria o Set-Cookie da sessao.
  sameSite: "lax" as const,
  path: "/",
  secure: SECURE_COOKIES,
};

export function isGoogleAuthEnabled(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}
