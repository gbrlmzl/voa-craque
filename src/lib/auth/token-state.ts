import { SESSION_GRACE_S } from "@/lib/auth/config";

/**
 * - active:  vivo (atual ou pendente), pode ser usado e rotacionado
 * - grace:   acabou de ser aposentado pelo uso do sucessor e a familia tem token
 *            vivo; e uma requisicao que ja estava em voo, nao um ataque
 * - reused:  revogado fora da graca, ou revogado sem sucessor (logout, reuso
 *            detectado): alguem guardou uma copia do token
 * - expired: passou do prazo de inatividade
 * - unknown: nao existe (lixo, ou linha ja purgada)
 */
export type TokenState = "active" | "grace" | "reused" | "expired" | "unknown";

export type TokenRow = { revokedAt: Date | null; expiresAt: Date };

/** So vale a pena procurar sucessor vivo quando a revogacao cabe na janela de graca. */
export function withinGrace(revokedAt: Date, now: Date): boolean {
  return now.getTime() - revokedAt.getTime() <= SESSION_GRACE_S * 1000;
}

/**
 * A graca vale so para quem foi aposentado por rotacao. Tempo sozinho nao serve
 * de criterio: logout e deteccao de reuso tambem gravam revokedAt = agora, e
 * uma janela puramente temporal ressuscitaria por alguns segundos exatamente as
 * sessoes que esses fluxos existem para matar. O que diferencia os casos:
 * rotacao legitima deixa um token vivo na familia; revogacao em massa nao
 * deixa nenhum.
 */
export function classifyToken(row: TokenRow | null, hasLiveSuccessor: boolean, now: Date): TokenState {
  if (!row) return "unknown";
  if (row.revokedAt) {
    return withinGrace(row.revokedAt, now) && hasLiveSuccessor ? "grace" : "reused";
  }
  return row.expiresAt > now ? "active" : "expired";
}
