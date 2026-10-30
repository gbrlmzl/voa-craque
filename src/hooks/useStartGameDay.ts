"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Confirma e chama "Iniciar pelada"; deu certo (inclusive se outro organizador chegou primeiro), vai para o painel. */
export function useStartGameDay(gameDayId: string) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openConfirm() {
    setError(null);
    setOpen(true);
  }

  function close() {
    if (!starting) setOpen(false);
  }

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const response = await fetch(`/api/game-days/${gameDayId}/start`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível iniciar a pelada.");
      // `starting` fica ligado ate a tela trocar: evita um segundo toque.
      router.push(`/game-days/${gameDayId}/panel`);
    } catch (caught) {
      setError((caught as Error).message);
      setStarting(false);
    }
  }

  return { open, openConfirm, close, starting, error, start };
}
