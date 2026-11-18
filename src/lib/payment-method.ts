import type { PaymentMethod, PaymentStatus } from "@/generated/prisma/client";

/** O que a regra precisa saber do pagamento da inscricao. */
export type PaymentSnapshot = {
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  receiptUrl: string | null;
};

export type PaymentMethodChangeCheck = { ok: true } | { ok: false; error: string };

/**
 * Quando o jogador pode trocar a propria forma de pagamento. Sem dependencia de
 * servidor: o botao do painel (desabilitado + o motivo) e a API usam a mesma regra.
 *
 * - Pagamento ja confirmado pelo organizador: nao troca.
 * - PIX com comprovante anexado: so troca depois que o organizador recusa o comprovante.
 * - O resto troca: no local (aguardando ou recusado) e PIX sem comprovante.
 */
export function checkPaymentMethodChange(payment: PaymentSnapshot): PaymentMethodChangeCheck {
  if (payment.paymentStatus === "CONFIRMED") {
    return { ok: false, error: "O organizador já confirmou o seu pagamento." };
  }
  if (payment.paymentMethod === "PIX" && payment.receiptUrl && payment.paymentStatus !== "REJECTED") {
    return {
      ok: false,
      error: "Seu comprovante está em análise. Só dá para trocar se o organizador recusá-lo.",
    };
  }
  return { ok: true };
}

/** So ha duas formas: trocar e ir para a outra. */
export function otherPaymentMethod(method: PaymentMethod): PaymentMethod {
  return method === "PIX" ? "ON_SITE" : "PIX";
}
