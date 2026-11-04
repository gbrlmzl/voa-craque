"use client";

import { createPortal } from "react-dom";
import { Button, Modal } from "@/components/ui";

/** "Descartar alteracoes?": fechar (X, Esc, fundo) vale como "Continuar editando". */
export function DiscardChangesModal({
  open,
  onDiscard,
  onKeepEditing,
}: {
  open: boolean;
  onDiscard: () => void;
  onKeepEditing: () => void;
}) {
  if (!open) return null;

  // No body, depois de tudo: o menu do celular (z-50, depois do <main>) ficaria por cima do modal.
  return createPortal(
    <Modal onClose={onKeepEditing} title="Descartar alterações?">
      <p className="text-sm text-slate-300">
        Você mudou seus dados e ainda não salvou. Se sair agora, as mudanças se perdem.
      </p>
      <div className="grid gap-2">
        <Button type="button" variant="danger" size="lg" onClick={onDiscard}>
          Descartar
        </Button>
        <Button type="button" variant="ghost" onClick={onKeepEditing}>
          Continuar editando
        </Button>
      </div>
    </Modal>,
    document.body,
  );
}
