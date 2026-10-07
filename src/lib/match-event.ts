/**
 * Lances de uma partida (gol e assistencia).
 *
 * Modulo puro, no mesmo estilo de match-engine.ts: so decide quais eventos um
 * pedido cria. O servico (src/services/match.ts) grava todos na mesma transacao,
 * entao o gol que encerra a partida ja leva a assistencia junto.
 */

export type MatchEventType = "GOAL" | "ASSIST";

export type MatchEventRequest = {
  type: MatchEventType;
  userId: string;
  /** Quem deu a assistencia. So vale junto de um GOAL. */
  assistUserId?: string | null;
};

export type MatchEventDraft = { type: MatchEventType; userId: string };

export type MatchEventPlan =
  | { ok: true; drafts: MatchEventDraft[] }
  | { ok: false; message: string };

/** Eventos a gravar, na ordem: o gol primeiro e a assistencia logo depois. */
export function planMatchEvents(request: MatchEventRequest): MatchEventPlan {
  const { type, userId, assistUserId } = request;
  const drafts: MatchEventDraft[] = [{ type, userId }];

  if (!assistUserId) return { ok: true, drafts };

  if (type !== "GOAL") {
    return { ok: false, message: "Só um gol pode ter assistência." };
  }
  if (assistUserId === userId) {
    return { ok: false, message: "Quem fez o gol não pode dar a assistência." };
  }
  drafts.push({ type: "ASSIST", userId: assistUserId });
  return { ok: true, drafts };
}

export type PairableEvent = {
  id: string;
  type: MatchEventType;
  teamId: string;
  elapsedMs: number;
  /** ISO 8601: ordena como texto. */
  createdAt: string;
};

/**
 * Liga cada assistencia ao gol que a gerou. O banco nao guarda esse vinculo, mas
 * os dois nascem na mesma transacao, com o mesmo time e o mesmo minuto, o gol
 * primeiro (ver planMatchEvents). Devolve so os gols, do primeiro ao ultimo; um
 * gol sem assistencia (individual) fica com `assist: null`.
 */
export function pairGoalsWithAssists<T extends PairableEvent>(events: T[]): { goal: T; assist: T | null }[] {
  const order = (type: MatchEventType) => (type === "GOAL" ? 0 : 1);
  const chronological = [...events].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || order(a.type) - order(b.type) || a.id.localeCompare(b.id),
  );

  const pairs: { goal: T; assist: T | null }[] = [];
  for (const event of chronological) {
    if (event.type === "GOAL") {
      pairs.push({ goal: event, assist: null });
      continue;
    }
    // A assistencia vai para o gol mais recente do mesmo time e minuto que ainda a espera.
    const open = [...pairs]
      .reverse()
      .find((pair) => !pair.assist && pair.goal.teamId === event.teamId && pair.goal.elapsedMs === event.elapsedMs);
    if (open) open.assist = event;
  }

  // O sort e estavel: gols no mesmo instante mantem a ordem em que foram marcados.
  return pairs.sort((a, b) => a.goal.elapsedMs - b.goal.elapsedMs);
}
