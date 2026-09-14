"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Flag } from "lucide-react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui";

/**
 * Encerrar a pelada e irreversivel, entao aqui a confirmacao existe de proposito
 * (diferente de gol e assistencia, que se corrigem no snackbar).
 */
export function FinishGameDayButton({
  gameDayId,
  variant = "danger",
  className,
}: {
  gameDayId: string;
  variant?: "danger" | "secondary";
  className?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  async function finish() {
    setSaving(true);
    try {
      const response = await fetch(`/api/peladas/${gameDayId}/encerrar`, { method: "POST" });
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

  if (!confirming) {
    return (
      <Button variant={variant} size="lg" className={className} onClick={() => setConfirming(true)}>
        <Flag size={18} /> Encerrar pelada
      </Button>
    );
  }

  return (
    <div className="grid gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3">
      <p className="text-sm text-rose-200">
        A fila zera, a partida em andamento é fechada pelo placar atual e ninguém mais inicia partidas.
        Isso não volta atrás.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="lg" onClick={() => setConfirming(false)} disabled={saving}>
          Voltar
        </Button>
        <Button variant="danger" size="lg" onClick={finish} disabled={saving}>
          {saving ? "Encerrando..." : "Encerrar mesmo"}
        </Button>
      </div>
    </div>
  );
}
