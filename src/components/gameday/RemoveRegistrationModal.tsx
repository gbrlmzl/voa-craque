"use client";

import { Button, Modal } from "@/components/ui";

export function RemoveRegistrationModal({
  name,
  busy,
  onConfirm,
  onCancel,
}: {
  name: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title="Remover inscrição" onClose={() => !busy && onCancel()}>
      <div className="grid gap-4">
        <p className="text-sm text-slate-300">
          Remover {name} da pelada? A inscrição e o pagamento dele saem da lista.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="danger" size="lg" onClick={onConfirm} disabled={busy}>
            {busy ? "Removendo..." : "Remover"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
