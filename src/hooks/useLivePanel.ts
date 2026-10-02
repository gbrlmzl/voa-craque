"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/providers/ToastProvider";
import type { LivePlayer, LiveSnapshot, LiveTeam } from "@/services/live";
import { useCountdown, useLive } from "@/hooks/useLive";

type Pending = { eventId: string; assistEventId: string | null; matchId: string };
export type PendingGoal = { team: LiveTeam; player: LivePlayer };
export type PendingSubstitution = { team: LiveTeam };
type SubstitutionChoice = { outUserId: string; inUserId: string; permanent: boolean };

export function useLivePanel(gameDayId: string, initial: LiveSnapshot) {
  const router = useRouter();
  const toast = useToast();
  const { snapshot, receivedAt, streaming, refresh } = useLive(gameDayId, initial);
  const remainingMs = useCountdown(snapshot.match, receivedAt);

  const [busy, setBusy] = useState(false);
  const [dismissedFinish, setDismissedFinish] = useState<string | null>(null);
  const [pendingGoal, setPendingGoal] = useState<PendingGoal | null>(null);
  const [substitutionOf, setSubstitutionOf] = useState<{ matchId: string; teamId: string } | null>(null);

  const match = snapshot.match;
  // Guarda so os ids e relê o time do snapshot: o modal acompanha a partida ao
  // vivo e fecha sozinho se ela mudar (por exemplo, o tempo acabar) com ele aberto.
  const substitutionTeam =
    match && substitutionOf?.matchId === match.id
      ? ([match.home, match.away].find((team) => team.id === substitutionOf.teamId) ?? null)
      : null;
  const pendingSubstitution: PendingSubstitution | null = substitutionTeam
    ? { team: substitutionTeam }
    : null;
  const finished = snapshot.gameDay.status === "FINISHED";
  const showResult =
    !!snapshot.lastFinished &&
    snapshot.lastFinished.id !== dismissedFinish &&
    (!match || match.status === "SCHEDULED");

  async function call(url: string, init: RequestInit, successMessage?: string, onOk?: () => void) {
    setBusy(true);
    try {
      const response = await fetch(url, init);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não deu certo.");
      onOk?.();
      if (successMessage) toast.show({ message: successMessage, tone: "success" });
      await refresh();
      router.refresh();
      return body as Record<string, unknown>;
    } catch (error) {
      toast.show({ message: (error as Error).message, tone: "error" });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function undo(pending: Pending) {
    const query = pending.assistEventId ? `?assistEventId=${encodeURIComponent(pending.assistEventId)}` : "";
    await call(`/api/matches/${pending.matchId}/events/${pending.eventId}${query}`, { method: "DELETE" }, "Desfeito.");
  }

  /**
   * Gol e assistencia vao num unico pedido: o gol decisivo encerra a partida, e
   * uma segunda chamada para a assistencia a encontraria ja FINISHED (409).
   */
  async function recordGoal(team: LiveTeam, player: LivePlayer, assist: LivePlayer | null) {
    if (!match) return;
    const matchId = match.id;

    const body = await call(`/api/matches/${matchId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "GOAL",
        teamId: team.id,
        userId: player.userId,
        assistUserId: assist?.userId ?? null,
      }),
    });
    if (!body?.eventId) return;

    const pending: Pending = {
      eventId: String(body.eventId),
      assistEventId: body.assistEventId ? String(body.assistEventId) : null,
      matchId,
    };
    toast.show({
      message: assist ? `Gol de ${player.name}, assistência de ${assist.name}` : `Gol de ${player.name}`,
      tone: "success",
      durationMs: 4000,
      actionLabel: "Desfazer",
      onAction: () => undo(pending),
    });
  }

  async function undoSubstitution(matchId: string, substitutionId: string) {
    await call(
      `/api/matches/${matchId}/substitutions/${substitutionId}`,
      { method: "DELETE" },
      "Substituição desfeita.",
    );
  }

  /** A troca nao pausa a partida: no futsal ela e volante, com a bola rolando. */
  function startSubstitution(team: LiveTeam) {
    if (match) setSubstitutionOf({ matchId: match.id, teamId: team.id });
  }

  async function confirmSubstitution(choice: SubstitutionChoice) {
    if (!match || !pendingSubstitution) return;
    const matchId = match.id;
    const { team } = pendingSubstitution;
    const outName = team.players.find((player) => player.userId === choice.outUserId)?.name ?? "?";
    const inName = match.bench.find((player) => player.userId === choice.inUserId)?.name ?? "?";

    // O modal fecha assim que o servidor aceita, antes do refresh do snapshot, para
    // nao piscar com a selecao ja invalida. Em caso de erro ele continua aberto.
    const body = await call(
      `/api/matches/${matchId}/substitutions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: team.id, ...choice }),
      },
      undefined,
      () => setSubstitutionOf(null),
    );
    if (!body?.substitutionId) return;

    toast.show({
      message: `Entrou ${inName}, saiu ${outName}`,
      tone: "success",
      durationMs: 4000,
      actionLabel: "Desfazer",
      onAction: () => undoSubstitution(matchId, String(body.substitutionId)),
    });
  }

  function cancelSubstitution() {
    setSubstitutionOf(null);
  }

  const changeState = (action: "START" | "PAUSE" | "RESUME" | "END") =>
    call(
      `/api/matches/${match?.id}/state`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      },
      action === "START" ? "Partida iniciada." : action === "END" ? "Partida encerrada." : undefined,
    );

  /**
   * Gol sempre para o jogo: primeiro pausa (se estiver rolando) e so entao
   * abre o modal de assistencia. O organizador precisa retomar manualmente.
   */
  async function startGoal(team: LiveTeam, player: LivePlayer) {
    if (!match) return;
    if (match.status === "RUNNING") {
      const body = await changeState("PAUSE");
      if (!body) return;
    }
    setPendingGoal({ team, player });
  }

  async function confirmGoal(assist: LivePlayer | null) {
    if (!pendingGoal) return;
    const { team, player } = pendingGoal;
    setPendingGoal(null);
    await recordGoal(team, player, assist);
  }

  function cancelGoal() {
    setPendingGoal(null);
  }

  function dismissFinish() {
    if (snapshot.lastFinished) setDismissedFinish(snapshot.lastFinished.id);
  }

  return {
    snapshot,
    match,
    remainingMs,
    streaming,
    busy,
    finished,
    showResult,
    pendingGoal,
    startGoal,
    confirmGoal,
    cancelGoal,
    pendingSubstitution,
    startSubstitution,
    confirmSubstitution,
    cancelSubstitution,
    changeState,
    dismissFinish,
  };
}
