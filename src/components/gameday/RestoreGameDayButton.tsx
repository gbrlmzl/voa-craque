"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";
import { useRestoreGameDay } from "@/hooks/useRestoreGameDay";

export function RestoreGameDayButton({ gameDayId }: { gameDayId: string }) {
  const { confirming, setConfirming, saving, restore } = useRestoreGameDay(gameDayId);

  if (!confirming) {
    return (
      <Button variant="secondary" size="lg" className="w-full" onClick={() => setConfirming(true)}>
        <RotateCcw size={18} /> Restaurar
      </Button>
    );
  }

  return (
    <div className="grid gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 sm:col-span-2">
      <p className="text-sm text-amber-100">
        Os times, reservas e a partida agendada serão removidos. As inscrições serão mantidas e a pelada
        voltará a ficar aberta.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="lg" onClick={() => setConfirming(false)} disabled={saving}>
          Voltar
        </Button>
        <Button variant="secondary" size="lg" onClick={restore} disabled={saving}>
          {saving ? "Restaurando..." : "Restaurar mesmo"}
        </Button>
      </div>
    </div>
  );
}
