"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import type { EvaluationPlayer } from "@/hooks/usePlayerEvaluation";

export function usePlayerEvaluationRow(player: EvaluationPlayer) {
  const router = useRouter();
  const toast = useToast();
  const [stars, setStars] = useState<number | null>(player.stars);
  const [selected, setSelected] = useState<string[]>(player.skillCodes);
  const [saving, setSaving] = useState(false);

  const dirty =
    stars !== player.stars ||
    selected.length !== player.skillCodes.length ||
    selected.some((code) => !player.skillCodes.includes(code));

  function toggleSkill(code: string) {
    setSelected((current) => (current.includes(code) ? current.filter((c) => c !== code) : [...current, code]));
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch(`/api/players/${player.userId}/evaluation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stars, skillCodes: selected }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível salvar.");
      toast.show({ message: `${player.name} avaliado.`, tone: "success" });
      router.refresh();
    } catch (error) {
      toast.show({ message: (error as Error).message, tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return { stars, setStars, selected, toggleSkill, saving, dirty, save };
}
