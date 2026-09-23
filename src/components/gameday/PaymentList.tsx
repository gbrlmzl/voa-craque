"use client";

import { Check, Receipt, RotateCcw, X } from "lucide-react";
import { PlayerChip } from "@/components/Player";
import { Badge, Button, Card, EmptyState, SectionTitle } from "@/components/ui";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/labels";
import { type PaymentRow, usePaymentList } from "@/hooks/usePaymentList";

export type { PaymentRow } from "@/hooks/usePaymentList";

const STATUS_TONE = { PENDING: "warn", CONFIRMED: "good", REJECTED: "bad" } as const;

/** Confirmacao manual: o organizador olha o comprovante e decide. */
export function PaymentList({ gameDayId, rows }: { gameDayId: string; rows: PaymentRow[] }) {
  const { busy, decide } = usePaymentList(gameDayId);
  const pending = rows.filter((row) => row.paymentStatus === "PENDING").length;

  return (
    <section>
      <SectionTitle hint={pending > 0 ? `${pending} aguardando` : "tudo conferido"}>
        Pagamentos
      </SectionTitle>

      {rows.length === 0 ? (
        <EmptyState title="Ninguém se inscreveu ainda" />
      ) : (
        <Card className="grid gap-1 p-2">
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
                <a
                  href={row.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="touch-target grid place-items-center rounded-xl text-slate-400 hover:bg-white/5"
                  aria-label={`Comprovante de ${row.name}`}
                >
                  <Receipt size={18} />
                </a>
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
                      onClick={() => decide(row, "REJECTED")}
                      aria-label={`Recusar pagamento de ${row.name}`}
                    >
                      <X size={16} />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}
