"use client";

import { Check, Receipt, RotateCcw, Wallet, X } from "lucide-react";
import { PlayerChip } from "@/components/Player";
import { Badge, Button, EmptyState, Modal } from "@/components/ui";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/labels";
import { type PaymentRow, usePaymentList } from "@/hooks/usePaymentList";
import { ReceiptModal } from "@/components/gameday/ReceiptModal";
import { RejectReasonModal } from "@/components/gameday/RejectReasonModal";

export type { PaymentRow } from "@/hooks/usePaymentList";

const STATUS_TONE = { PENDING: "warn", CONFIRMED: "good", REJECTED: "bad" } as const;

/**
 * Confirmacao manual: o organizador olha o comprovante e decide. A lista fica
 * num modal para nao ocupar a pagina; o botao resume o que falta conferir.
 */
export function PaymentList({ gameDayId, rows }: { gameDayId: string; rows: PaymentRow[] }) {
  const { open, openModal, closeModal, busy, decide, viewing, setViewing, rejecting, setRejecting } =
    usePaymentList(gameDayId);
  const pending = rows.filter((row) => row.paymentStatus === "PENDING").length;
  const summary: { tone: "neutral" | "warn" | "good"; label: string } =
    rows.length === 0
      ? { tone: "neutral", label: "ninguém inscrito" }
      : pending > 0
        ? { tone: "warn", label: `${pending} aguardando` }
        : { tone: "good", label: "tudo conferido" };
  const summaryBadge = <Badge tone={summary.tone}>{summary.label}</Badge>;

  return (
    <>
      <Button variant="secondary" size="lg" className="w-full justify-between" onClick={openModal}>
        <span className="flex items-center gap-2">
          <Wallet size={18} /> Pagamentos
        </span>
        {summaryBadge}
      </Button>

      {/* Esc fecha so o modal de cima: os de comprovante e recusa tambem escutam o Esc. */}
      <Modal
        open={open}
        onClose={() => {
          if (!viewing && !rejecting) closeModal();
        }}
        title="Pagamentos"
        className="flex max-h-[85dvh] max-w-md flex-col"
      >
        <div>{summaryBadge}</div>

        {rows.length === 0 ? (
          <EmptyState title="Ninguém se inscreveu ainda" />
        ) : (
          <div className="-mx-2 grid min-h-0 flex-1 content-start gap-1 overflow-y-auto px-2">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center gap-2 rounded-xl px-1 py-1.5 hover:bg-white/5"
              >
                <PlayerChip
                  userId={row.userId}
                  name={row.name}
                  photoUrl={row.photoUrl}
                  subtitle={PAYMENT_METHOD_LABEL[row.paymentMethod]}
                  className="min-w-0 flex-1"
                />

                <Badge tone={STATUS_TONE[row.paymentStatus]}>
                  {PAYMENT_STATUS_LABEL[row.paymentStatus]}
                </Badge>

                {row.receiptUrl ? (
                  <button
                    type="button"
                    onClick={() => setViewing(row)}
                    className="touch-target grid place-items-center rounded-xl text-slate-400 hover:bg-white/5"
                    aria-label={`Comprovante de ${row.name}`}
                  >
                    <Receipt size={18} />
                  </button>
                ) : null}

                <div className="flex items-center gap-1">
                  {row.paymentStatus === "CONFIRMED" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy === row.id}
                      onClick={() => decide(row, "PENDING")}
                      aria-label={`Desfazer confirmação de ${row.name}`}
                    >
                      <RotateCcw size={16} />
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === row.id}
                        onClick={() => decide(row, "CONFIRMED")}
                        aria-label={`Confirmar pagamento de ${row.name}`}
                      >
                        <Check size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy === row.id}
                        onClick={() => setRejecting(row)}
                        aria-label={`Recusar pagamento de ${row.name}`}
                      >
                        <X size={16} />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Irmaos do modal, nao filhos: ele anima com transform, e um `fixed` dentro ficaria preso ao cartao. */}
      {viewing?.receiptUrl ? (
        <ReceiptModal
          url={viewing.receiptUrl}
          title={`Comprovante de ${viewing.name}`}
          decision={
            viewing.paymentStatus === "CONFIRMED"
              ? undefined
              : {
                  busy: busy === viewing.id,
                  onReject: () => {
                    setViewing(null);
                    setRejecting(viewing);
                  },
                  onApprove: () => decide(viewing, "CONFIRMED"),
                }
          }
          onClose={() => setViewing(null)}
        />
      ) : null}

      {rejecting ? (
        <RejectReasonModal
          name={rejecting.name}
          busy={busy === rejecting.id}
          onConfirm={(reason) => decide(rejecting, "REJECTED", reason)}
          onCancel={() => setRejecting(null)}
        />
      ) : null}
    </>
  );
}
