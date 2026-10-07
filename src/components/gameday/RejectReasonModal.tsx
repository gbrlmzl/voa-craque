"use client";

import { useState } from "react";
import { Button, Modal, Textarea } from "@/components/ui";

/** Pede o motivo da recusa. O texto e opcional: o jogador o ve na inscricao dele, se houver. */
export function RejectReasonModal({
  name,
  busy,
  onConfirm,
  onCancel,
}: {
  name: string;
  busy: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <Modal title="Motivo da recusa (opcional)" onClose={() => !busy && onCancel()}>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(reason.trim());
        }}
      >
        <p className="text-sm text-slate-400">
          Pagamento de {name}. O motivo aparece para o jogador na inscrição dele.
        </p>
        <Textarea
          autoFocus
          aria-label="Motivo da recusa"
          maxLength={200}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Ex.: comprovante ilegível ou valor incorreto"
        />
        <div className="grid gap-2">
          <Button type="submit" variant="danger" size="lg" disabled={busy}>
            {busy ? "Recusando..." : "Recusar pagamento"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
