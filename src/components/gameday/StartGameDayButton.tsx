"use client";

import { Play } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { useStartGameDay } from "@/hooks/useStartGameDay";

/** "Iniciar pelada": confirma antes, porque a partir dai os times nao podem mais ser refeitos. */
export function StartGameDayButton({ gameDayId }: { gameDayId: string }) {
  const { open, openConfirm, close, starting, error, start } = useStartGameDay(gameDayId);

  return (
    <>
      <Button size="lg" className="w-full" onClick={openConfirm}>
        <Play size={18} /> Iniciar pelada
      </Button>

      <Modal open={open} onClose={close} title="Iniciar pelada?">
        <p className="text-sm text-slate-300">
          A pelada passa para &quot;Rolando agora&quot; e você vai para o painel ao vivo, onde inicia a
          primeira partida. Depois disso, os times não podem mais ser refeitos.
        </p>
        {error ? (
          <p role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" onClick={close} disabled={starting}>
            Cancelar
          </Button>
          <Button size="lg" onClick={start} disabled={starting}>
            {starting ? "Iniciando..." : "Iniciar"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
