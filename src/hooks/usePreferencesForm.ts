"use client";

import { useTransition } from "react";
import { setTeamLabelModeAction } from "@/actions/preferences";
import { useToast } from "@/components/providers/ToastProvider";
import { useSetTeamLabelMode, useTeamLabelMode, useTeamName } from "@/components/providers/PreferencesProvider";
import type { TeamLabelMode } from "@/lib/team-label";

export function usePreferencesForm() {
  const toast = useToast();
  const mode = useTeamLabelMode();
  const setMode = useSetTeamLabelMode();
  const teamName = useTeamName();
  const [saving, startTransition] = useTransition();

  /** Troca na hora (otimista) e grava o cookie por tras; se falhar, volta ao que era. */
  function choose(next: TeamLabelMode) {
    if (next === mode) return;
    const previous = mode;
    setMode(next);

    startTransition(async () => {
      try {
        const result = await setTeamLabelModeAction(next);
        if (!result.ok) throw new Error("recusado");
        toast.show({ message: "Preferência salva.", tone: "success" });
      } catch {
        setMode(previous);
        toast.show({ message: "Não foi possível salvar a preferência.", tone: "error" });
      }
    });
  }

  return { mode, choose, saving, preview: ["A", "B", "C"].map(teamName).join(", ") };
}
