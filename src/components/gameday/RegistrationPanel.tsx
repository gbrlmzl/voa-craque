"use client";

import Link from "next/link";
import { LogIn, Receipt } from "lucide-react";
import { Badge, Button, Card, SectionTitle } from "@/components/ui";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/labels";
import { checkPaymentMethodChange, otherPaymentMethod } from "@/lib/payment-method";
import { useLoginRedirect } from "@/hooks/useLoginRedirect";
import { type Registration, useRegistrationPanel } from "@/hooks/useRegistrationPanel";
import { ChangePaymentMethodModal } from "@/components/gameday/ChangePaymentMethodModal";
import { PixReceiptField } from "@/components/gameday/PixReceiptField";
import { ReceiptModal } from "@/components/gameday/ReceiptModal";

export type { Registration } from "@/hooks/useRegistrationPanel";

const STATUS_TONE = { PENDING: "warn", CONFIRMED: "good", REJECTED: "bad" } as const;

export function RegistrationPanel({
  gameDayId,
  price,
  pixKey,
  registration,
  open,
  full,
  guest = false,
  registrationsClosed = false,
}: {
  gameDayId: string;
  price: string;
  pixKey: string | null;
  registration: Registration | null;
  open: boolean;
  full: boolean;
  /** Visitante: em vez do formulario, o convite para entrar. */
  guest?: boolean;
  /** "Inscricoes abertas" desligada em /admin/system; so o visitante ve o aviso (o jogador recebe o erro ao confirmar). */
  registrationsClosed?: boolean;
}) {
  const {
    method,
    setMethod,
    reviewing,
    receipt,
    pickReceipt,
    cancelReview,
    confirmReview,
    removeReceipt,
    viewingPrepared,
    setViewingPrepared,
    uploading,
    saving,
    message,
    viewingReceipt,
    setViewingReceipt,
    subscribe,
    changing,
    openChange,
    closeChange,
    changeMethod,
    cancel,
    copyPixKey,
  } = useRegistrationPanel(gameDayId);

  // Durante o envio e a inscricao nada do comprovante muda.
  const busy = saving || uploading;

  // Irmaos do cartao, como no resto do projeto: o Modal anima com transform.
  const receiptModals = (
    <>
      {reviewing ? (
        <ReceiptModal
          url={reviewing.previewUrl}
          title="Seu comprovante"
          confirmation={{ onCancel: cancelReview, onConfirm: confirmReview }}
          onClose={cancelReview}
        />
      ) : null}
      {viewingPrepared && receipt ? (
        <ReceiptModal url={receipt.previewUrl} title="Seu comprovante" onClose={() => setViewingPrepared(false)} />
      ) : null}
    </>
  );

  if (registration) {
    const change = checkPaymentMethodChange(registration);
    const target = otherPaymentMethod(registration.paymentMethod);

    return (
      <section>
        <SectionTitle>Sua inscrição</SectionTitle>
        <Card className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[registration.paymentStatus]}>
              {PAYMENT_STATUS_LABEL[registration.paymentStatus]}
            </Badge>
            <span className="text-sm text-slate-400">
              {PAYMENT_METHOD_LABEL[registration.paymentMethod]} · {price}
            </span>
          </div>

          {registration.rejectedReason ? (
            <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {registration.rejectedReason}
            </p>
          ) : null}

          {registration.receiptUrl ? (
            <button
              type="button"
              onClick={() => setViewingReceipt(true)}
              className="inline-flex items-center gap-2 justify-self-start text-sm text-pitch-400 underline underline-offset-4"
            >
              <Receipt size={15} /> Ver meu comprovante
            </button>
          ) : null}

          {/* Desabilitado, nunca escondido: o motivo aparece logo abaixo. */}
          <div className={open ? "grid grid-cols-2 gap-2" : "grid"}>
            {/* px-2: com o padding padrao "Alterar pagamento" quebra em duas linhas no celular. */}
            <Button
              variant="secondary"
              className="px-2"
              onClick={openChange}
              disabled={saving || !change.ok}
              aria-describedby={change.ok ? undefined : "change-payment-hint"}
            >
              Alterar pagamento
            </Button>
            {open ? (
              <Button variant="secondary" className="px-2" onClick={cancel} disabled={saving}>
                Cancelar inscrição
              </Button>
            ) : null}
          </div>
          {change.ok ? null : (
            <p id="change-payment-hint" className="text-xs text-slate-500">
              {change.error}
            </p>
          )}
          {open ? null : (
            <p className="text-xs text-slate-500">
              Os times já foram montados. Para sair, fale com o organizador.
            </p>
          )}

          {message && !changing ? <p className="text-sm text-rose-300">{message}</p> : null}
        </Card>

        {changing ? (
          <ChangePaymentMethodModal
            from={registration.paymentMethod}
            to={target}
            pixKey={pixKey}
            receipt={receipt}
            uploading={uploading}
            saving={saving}
            message={message}
            onPickReceipt={pickReceipt}
            onViewReceipt={() => setViewingPrepared(true)}
            onRemoveReceipt={removeReceipt}
            onCopyPixKey={copyPixKey}
            onConfirm={() => void changeMethod(target)}
            // O Esc do modal de baixo tambem dispara com a previa aberta: so a previa fecha.
            onCancel={() => {
              if (!reviewing && !viewingPrepared) closeChange();
            }}
          />
        ) : null}
        {receiptModals}

        {viewingReceipt && registration.receiptUrl ? (
          <ReceiptModal
            url={registration.receiptUrl}
            title="Meu comprovante"
            onClose={() => setViewingReceipt(false)}
          />
        ) : null}
      </section>
    );
  }

  if (!open) {
    return (
      <section>
        <SectionTitle>Inscrição</SectionTitle>
        <Card>
          <p className="text-sm text-slate-400">As inscrições desta pelada já foram encerradas.</p>
        </Card>
      </section>
    );
  }

  if (guest) return <GuestRegistration price={price} full={full} registrationsClosed={registrationsClosed} />;

  return (
    <section>
      <SectionTitle hint={price}>Entrar na pelada</SectionTitle>
      <Card className="grid gap-4">
        <div className="grid grid-cols-2 gap-2">
          {(["PIX", "ON_SITE"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMethod(option)}
              className={`touch-target rounded-xl border px-3 text-sm font-medium transition-colors ${
                method === option
                  ? "border-pitch-500 bg-pitch-500/15 text-pitch-300"
                  : "border-white/10 bg-night-800 text-slate-300"
              }`}
            >
              {PAYMENT_METHOD_LABEL[option]}
            </button>
          ))}
        </div>

        {method === "PIX" ? (
          <PixReceiptField
            pixKey={pixKey}
            receipt={receipt}
            busy={busy}
            onPick={pickReceipt}
            onView={() => setViewingPrepared(true)}
            onRemove={removeReceipt}
            onCopyPixKey={copyPixKey}
          />
        ) : (
          <p className="rounded-xl bg-white/5 px-3 py-2 text-sm text-slate-400">
            Você paga na hora, direto com o organizador. Ele confirma aqui depois.
          </p>
        )}

        {full ? (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
            A pelada já bateu o limite de jogadores.
          </p>
        ) : null}

        {message ? (
          <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{message}</p>
        ) : null}

        <Button size="lg" onClick={subscribe} disabled={busy || full}>
          {uploading ? "Enviando comprovante..." : saving ? "Inscrevendo..." : "Confirmar inscrição"}
        </Button>
      </Card>

      {receiptModals}
    </section>
  );
}

/** Cartao de quem nao tem conta: nada e enviado antes do login, entao nenhum comprovante se perde. */
function GuestRegistration({
  price,
  full,
  registrationsClosed,
}: {
  price: string;
  full: boolean;
  registrationsClosed: boolean;
}) {
  const { loginHref } = useLoginRedirect();
  const notice = registrationsClosed
    ? "As inscrições estão fechadas no momento."
    : full
      ? "A pelada já bateu o limite de jogadores."
      : null;

  return (
    <section>
      <SectionTitle hint={price}>Sua inscrição</SectionTitle>
      <Card className="grid gap-3">
        {notice ? (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{notice}</p>
        ) : (
          <>
            <p className="text-sm text-slate-300">Entre na sua conta para garantir sua vaga.</p>
            <Link href={loginHref}>
              <Button size="lg" className="w-full">
                <LogIn size={18} /> Quero jogar
              </Button>
            </Link>
          </>
        )}
      </Card>
    </section>
  );
}
