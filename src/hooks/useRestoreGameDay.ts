"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";

export function useRestoreGameDay(gameDayId: string) {
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  async function restore() {
    setSaving(true);
    try {
      const response = await fetch(`/api/game-days/${gameDayId}/restore`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível restaurar.");
      toast.show({ message: "Pelada restaurada. As inscrições estão abertas.", tone: "success" });
      setConfirming(false);
      router.push(`/game-days/${gameDayId}`);
      router.refresh();
    } catch (error) {
      toast.show({ message: (error as Error).message, tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return { confirming, setConfirming, saving, restore };
}
