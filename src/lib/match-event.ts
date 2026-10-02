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
