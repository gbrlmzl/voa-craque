"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";

/** Recomputar apaga ajustes manuais e refaz toda a historia: pede confirmacao antes. */
export function useRatingRecompute() {
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const response = await fetch("/api/admin/rating/recompute", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível recomputar.");
      toast.show({
        message: `MMR recomputado: ${body.gameDays} peladas, ${body.players} jogadores.`,
        tone: "success",
      });
      setConfirming(false);
      router.refresh();
    } catch (error) {
      toast.show({ message: (error as Error).message, tone: "error" });
    } finally {
      setRunning(false);
    }
  }

  return { confirming, setConfirming, running, run };
}
