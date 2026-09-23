"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";

export function useFinishGameDay(gameDayId: string) {
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  async function finish() {
    setSaving(true);
    try {
      const response = await fetch(`/api/game-days/${gameDayId}/finish`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível encerrar.");
      toast.show({ message: "Pelada encerrada. Estatísticas contabilizadas.", tone: "success" });
      setConfirming(false);
      router.refresh();
    } catch (error) {
      toast.show({ message: (error as Error).message, tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return { confirming, setConfirming, saving, finish };
}
