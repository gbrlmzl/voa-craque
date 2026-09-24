"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/providers/ToastProvider";
import type { LivePlayer, LiveSnapshot, LiveTeam } from "@/services/live";
import { useCountdown, useLive } from "@/hooks/useLive";

type Pending = { eventId: string; matchId: string };
export type PendingGoal = { team: LiveTeam; player: LivePlayer };

export function useLivePanel(gameDayId: string, initial: LiveSnapshot) {
  const router = useRouter();
  const toast = useToast();
  const { snapshot, receivedAt, streaming, refresh } = useLive(gameDayId, initial);
  const remainingMs = useCountdown(snapshot.match, receivedAt);

  const [busy, setBusy] = useState(false);
  const [dismissedFinish, setDismissedFinish] = useState<string | null>(null);
  const [pendingGoal, setPendingGoal] = useState<PendingGoal | null>(null);

  const match = snapshot.match;
  const finished = snapshot.gameDay.status === "FINISHED";
  const showResult =
    !!snapshot.lastFinished &&
    snapshot.lastFinished.id !== dismissedFinish &&
    (!match || match.status === "SCHEDULED");

  async function call(url: string, init: RequestInit, successMessage?: string) {
    setBusy(true);
    try {
      const response = await fetch(url, init);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não deu certo.");
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
    await call(`/api/matches/${pending.matchId}/events/${pending.eventId}`, { method: "DELETE" }, "Desfeito.");
  }

  async function record(type: "GOAL" | "ASSIST", team: LiveTeam, player: LivePlayer) {
    if (!match) return;
    const matchId = match.id;

    const body = await call(`/api/matches/${matchId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, teamId: team.id, userId: player.userId }),
    });
    if (!body?.eventId) return;

    toast.show({
      message: `${type === "GOAL" ? "Gol" : "Assistência"} de ${player.name}`,
      tone: "success",
      durationMs: 4000,
      actionLabel: "Desfazer",
      onAction: () => undo({ eventId: String(body.eventId), matchId }),
    });
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
    await record("GOAL", team, player);
    if (assist) await record("ASSIST", team, assist);
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
    changeState,
    dismissFinish,
  };
}
