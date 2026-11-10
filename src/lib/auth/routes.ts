/**
 * - auth-endpoint:  rotas de autenticacao que gravam os proprios cookies (callback
 *                   do Google, /api/auth/refresh); o proxy nao mexe nelas
 * - guest-only:     quem tem sessao e mandado para o "proximo" (ou "/")
 * - public:         abre com ou sem sessao
 * - browsable-page: abre sem sessao; a guarda (pageViewer) decide se o site e
 *                   publico ou privado
 * - browsable-api:  idem para leitura em /api (requireViewer)
 * - protected-api:  sem sessao responde 401 em JSON
 * - protected-page: sem sessao vai para /login
 */
export type RouteKind =
  | "auth-endpoint"
  | "guest-only"
  | "public"
  | "browsable-page"
  | "browsable-api"
  | "protected-api"
  | "protected-page";

const GUEST_ONLY = new Set(["/login", "/register", "/forgot-password"]);
// /reset-password precisa abrir mesmo com alguem logado no navegador: como
// guest-only, o proxy mandaria para "/" e o token do link se perderia.
const PUBLIC = new Set(["/maintenance", "/reset-password"]);
// Estatisticas de uma pelada encerrada podem ser vistas por qualquer um (para
// compartilhar o link); a pelada em si (inscricao, pagamento, escalacao) nao.
const PUBLIC_PATTERNS = [/^\/game-days\/[^/]+\/stats$/];

// Paginas de consulta. Com o site aberto a visitantes (chave "Site privado"
// desligada) abrem sem login; com ele ligado, a guarda manda para /login.
// "/game-days/new" casa com o segundo padrao, por isso e barrado a parte.
const BROWSABLE_PAGES = [
  /^\/$/,
  /^\/game-days$/,
  /^\/game-days\/[^/]+$/,
  /^\/game-days\/[^/]+\/live$/,
  /^\/ranking$/,
];
const NOT_BROWSABLE = new Set(["/game-days/new"]);
// So o GET e de visitante: o handler de cada metodo escolhe a guarda dele.
const BROWSABLE_API = [
  /^\/api\/players\/[^/]+$/,
  /^\/api\/game-days\/[^/]+\/(live|stream)$/,
  /^\/api\/files\/fotos\/.+$/,
];

export function classifyPath(pathname: string): RouteKind {
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) return "auth-endpoint";
  if (GUEST_ONLY.has(pathname)) return "guest-only";
  if (PUBLIC.has(pathname) || PUBLIC_PATTERNS.some((pattern) => pattern.test(pathname))) return "public";
  if (!NOT_BROWSABLE.has(pathname) && BROWSABLE_PAGES.some((pattern) => pattern.test(pathname))) return "browsable-page";
  if (BROWSABLE_API.some((pattern) => pattern.test(pathname))) return "browsable-api";
  if (pathname === "/api" || pathname.startsWith("/api/")) return "protected-api";
  return "protected-page";
}

/** Destino interno seguro para depois do login; qualquer outra coisa vira "/". */
export function safeNextPath(value: unknown): string {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}

/**
 * Destino final de login e onboarding: alem de safeNextPath, rota so-de-deslogado
 * e /onboarding viram "/" (voltar para elas depois de entrar seria um laco).
 */
export function safeFinalPath(value: unknown): string {
  const path = safeNextPath(value);
  const pathname = path.split(/[?#]/, 1)[0];
  return pathname === "/onboarding" || GUEST_ONLY.has(pathname) ? "/" : path;
}

/** Monta "<base>?proximo=<destino>"; "/" nao precisa de proximo. Query via URLSearchParams porque o destino pode ter "?" e "&". */
export function withNext(base: string, next: unknown): string {
  const path = safeNextPath(next);
  if (path === "/") return base;
  return `${base}?${new URLSearchParams({ proximo: path })}`;
}

/** /login com o retorno. */
export function loginHref(next: unknown): string {
  return withNext("/login", next);
}

/** /onboarding com o retorno, ignorando destino que seja o proprio /onboarding ou rota so-de-deslogado. */
export function onboardingHref(next: unknown): string {
  return withNext("/onboarding", safeFinalPath(next));
}
