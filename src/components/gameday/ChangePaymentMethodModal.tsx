"use client";

import { Button, Modal } from "@/components/ui";
import { PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { PixReceiptField } from "@/components/gameday/PixReceiptField";

/**
 * Troca da forma de pagamento: so ha duas, entao o destino e a outra. Para PIX pede o
 * comprovante, como na inscricao; para "no local" basta confirmar.
 */
export function ChangePaymentMethodModal({
  from,
  to,
  pixKey,
  receipt,
  uploading,
  saving,
  message,
  onPickReceipt,
  onViewReceipt,
  onRemoveReceipt,
  onCopyPixKey,
  onConfirm,
  onCancel,
}: {
  from: "PIX" | "ON_SITE";
  to: "PIX" | "ON_SITE";
  pixKey: string | null;
  receipt: { file: File } | null;
  uploading: boolean;
  saving: boolean;
  message: string | null;
  onPickReceipt: (file: File) => void;
  onViewReceipt: () => void;
  onRemoveReceipt: () => void;
  onCopyPixKey: (pixKey: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const busy = saving || uploading;

  return (
    <Modal title="Alterar forma de pagamento" onClose={() => !busy && onCancel()}>
      <div className="grid gap-4">
        <p className="text-sm text-slate-300">
          Trocar <strong>{PAYMENT_METHOD_LABEL[from]}</strong> por <strong>{PAYMENT_METHOD_LABEL[to]}</strong>? O
          pagamento volta a ficar aguardando o organizador.
        </p>

        {to === "PIX" ? (
          <PixReceiptField
            pixKey={pixKey}
            receipt={receipt}
            busy={busy}
            onPick={onPickReceipt}
            onView={onViewReceipt}
            onRemove={onRemoveReceipt}
            onCopyPixKey={onCopyPixKey}
          />
        ) : (
          <p className="rounded-xl bg-white/5 px-3 py-2 text-sm text-slate-400">
            Você paga na hora, direto com o organizador. Ele confirma aqui depois.
          </p>
        )}

        {message ? (
          <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{message}</p>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button size="lg" onClick={onConfirm} disabled={busy}>
            {uploading ? "Enviando..." : saving ? "Alterando..." : "Alterar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
