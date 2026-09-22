/**
 * - auth-endpoint:  rotas do proprio Auth.js (callback do Google etc.)
 * - guest-only:     quem tem sessao e mandado para "/"
 * - public:         abre com ou sem sessao
 * - protected-api:  sem sessao responde 401 em JSON
 * - protected-page: sem sessao vai para /login
 */
export type RouteKind = "auth-endpoint" | "guest-only" | "public" | "protected-api" | "protected-page";

const GUEST_ONLY = new Set(["/login", "/registrar"]);
const PUBLIC = new Set(["/manutencao"]);

export function classifyPath(pathname: string): RouteKind {
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) return "auth-endpoint";
  if (GUEST_ONLY.has(pathname)) return "guest-only";
  if (PUBLIC.has(pathname)) return "public";
  if (pathname === "/api" || pathname.startsWith("/api/")) return "protected-api";
  return "protected-page";
}

/** Destino interno seguro para depois do login; qualquer outra coisa vira "/". */
export function safeNextPath(value: unknown): string {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}
