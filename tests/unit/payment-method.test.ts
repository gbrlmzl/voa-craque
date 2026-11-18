import { checkPaymentMethodChange, otherPaymentMethod, type PaymentSnapshot } from "@/lib/payment-method";

const RECEIPT = "/api/files/comprovantes/c.png";

const payment = (overrides: Partial<PaymentSnapshot>): PaymentSnapshot => ({
  paymentMethod: "ON_SITE",
  paymentStatus: "PENDING",
  receiptUrl: null,
  ...overrides,
});

describe("checkPaymentMethodChange", () => {
  it("pagamento confirmado pelo organizador nunca troca, em qualquer forma", () => {
    for (const paymentMethod of ["PIX", "ON_SITE"] as const) {
      expect(checkPaymentMethodChange(payment({ paymentMethod, paymentStatus: "CONFIRMED", receiptUrl: RECEIPT }))).toEqual({
        ok: false,
        error: "O organizador já confirmou o seu pagamento.",
      });
    }
  });

  it("PIX com comprovante aguardando conferencia nao troca", () => {
    expect(checkPaymentMethodChange(payment({ paymentMethod: "PIX", receiptUrl: RECEIPT }))).toEqual({
      ok: false,
      error: "Seu comprovante está em análise. Só dá para trocar se o organizador recusá-lo.",
    });
  });

  it("PIX com comprovante recusado troca", () => {
    expect(checkPaymentMethodChange(payment({ paymentMethod: "PIX", paymentStatus: "REJECTED", receiptUrl: RECEIPT }))).toEqual({ ok: true });
  });

  it("PIX sem comprovante troca, aguardando ou recusado", () => {
    expect(checkPaymentMethodChange(payment({ paymentMethod: "PIX" }))).toEqual({ ok: true });
    expect(checkPaymentMethodChange(payment({ paymentMethod: "PIX", paymentStatus: "REJECTED" }))).toEqual({ ok: true });
  });

  it("no local troca enquanto o organizador nao confirmou", () => {
    expect(checkPaymentMethodChange(payment({}))).toEqual({ ok: true });
    expect(checkPaymentMethodChange(payment({ paymentStatus: "REJECTED" }))).toEqual({ ok: true });
  });
});

describe("otherPaymentMethod", () => {
  it("vai para a outra forma", () => {
    expect(otherPaymentMethod("PIX")).toBe("ON_SITE");
    expect(otherPaymentMethod("ON_SITE")).toBe("PIX");
  });
});
