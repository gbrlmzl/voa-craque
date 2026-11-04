"use client";

import { Ban } from "lucide-react";
import { Button } from "@/components/ui";
import { useCancelGameDay } from "@/hooks/useCancelGameDay";

/**
 * Cancelar apaga times e partida agendada e nao volta atras, entao a confirmacao
 * fica na propria tela, no mesmo molde do "Encerrar pelada".
 */
export function CancelGameDayButton({ gameDayId }: { gameDayId: string }) {
  const { confirming, setConfirming, saving, cancel } = useCancelGameDay(gameDayId);

  if (!confirming) {
    return (
      <Button variant="danger" size="lg" className="w-full" onClick={() => setConfirming(true)}>
        <Ban size={18} /> Cancelar pelada
      </Button>
    );
  }

  return (
    <div className="grid gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3">
      <p className="text-sm text-rose-200">
        As inscrições fecham, os times e a partida agendada são apagados e a pelada fica como
        &quot;Cancelada&quot; para todo mundo. As inscrições e os pagamentos continuam registrados. Isso
        não volta atrás.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="lg" onClick={() => setConfirming(false)} disabled={saving}>
          Voltar
        </Button>
        <Button variant="danger" size="lg" onClick={cancel} disabled={saving}>
          {saving ? "Cancelando..." : "Cancelar mesmo"}
        </Button>
      </div>
    </div>
  );
}
