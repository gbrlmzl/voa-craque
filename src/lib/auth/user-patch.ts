import type { CurrentUser } from "@/lib/auth/current-user";

/**
 * Alteracao local sobre o usuario que veio do servidor. So existe mescla: login
 * e logout aqui sao Server Actions que mexem no cookie, e isso ja faz o servidor
 * mandar uma promise de sessao nova, com a identidade certa.
 */
export type UserPatch = Partial<Omit<CurrentUser, "id" | "role">>;

export function applyUserPatch(server: CurrentUser | null, patch: UserPatch | null): CurrentUser | null {
  // Nao existe "editar o perfil de ninguem": sem sessao, o patch nao tem onde cair.
  if (!server || !patch) return server;
  return { ...server, ...patch };
}

export function mergeUserPatch(previous: UserPatch | null, next: UserPatch): UserPatch {
  return { ...(previous ?? {}), ...next };
}
