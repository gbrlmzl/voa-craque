"use client";

import { RefreshCw } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { useRatingRecompute } from "@/hooks/useRatingRecompute";

export function RatingRecompute({ ratedGameDays }: { ratedGameDays: number }) {
  const { confirming, setConfirming, running, run } = useRatingRecompute();

  return (
    <Card className="grid gap-3">
      <div>
        <p className="font-semibold text-slate-100">Recalcular o MMR</p>
        <p className="mt-1 text-sm text-slate-400">
          Refaz o MMR de todo mundo a partir das peladas encerradas ({ratedGameDays}{" "}
          {ratedGameDays === 1 ? "contabilizada" : "contabilizadas"}). Use depois de mudar uma constante da
          fórmula. Os ajustes de MMR feitos na mão são apagados.
        </p>
      </div>

      {confirming ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="danger" size="lg" onClick={run} disabled={running}>
            <RefreshCw size={18} className={running ? "animate-spin" : undefined} />
            {running ? "Recalculando..." : "Recalcular mesmo assim"}
          </Button>
          <Button variant="secondary" size="lg" onClick={() => setConfirming(false)} disabled={running}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button variant="secondary" size="lg" onClick={() => setConfirming(true)}>
          <RefreshCw size={18} /> Recalcular o MMR
        </Button>
      )}
    </Card>
  );
}
