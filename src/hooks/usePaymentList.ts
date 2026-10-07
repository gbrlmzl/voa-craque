"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";

export type PaymentRow = {
  id: string;
  userId: string;
  name: string;
  photoUrl: string | null;
  paymentMethod: "PIX" | "ON_SITE";
  paymentStatus: "PENDING" | "CONFIRMED" | "REJECTED";
  receiptUrl: string | null;
};

export function usePaymentList(gameDayId: string) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<PaymentRow | null>(null);
  const [rejecting, setRejecting] = useState<PaymentRow | null>(null);

  async function decide(row: PaymentRow, status: PaymentRow["paymentStatus"], rejectedReason = "") {
    setBusy(row.id);
    try {
      const response = await fetch(`/api/game-days/${gameDayId}/registrations/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentStatus: status, rejectedReason }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível atualizar.");
      toast.show({
        message:
          status === "CONFIRMED"
            ? `Pagamento de ${row.name} confirmado.`
            : status === "REJECTED"
              ? `Pagamento de ${row.name} recusado.`
              : `Pagamento de ${row.name} voltou para pendente.`,
        tone: status === "CONFIRMED" ? "success" : "neutral",
      });
      setViewing(null);
      setRejecting(null);
      router.refresh();
    } catch (error) {
      toast.show({ message: (error as Error).message, tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  return {
    open,
    openModal: () => setOpen(true),
    closeModal: () => setOpen(false),
    busy,
    decide,
    viewing,
    setViewing,
    rejecting,
    setRejecting,
  };
}
