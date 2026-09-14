"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Check, Copy, Loader2, Receipt } from "lucide-react";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, SectionTitle } from "@/components/ui";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/labels";

type Registration = {
  id: string;
  paymentMethod: "PIX" | "ON_SITE";
  paymentStatus: "PENDING" | "CONFIRMED" | "REJECTED";
  receiptUrl: string | null;
  rejectedReason: string | null;
};

const STATUS_TONE = { PENDING: "warn", CONFIRMED: "good", REJECTED: "bad" } as const;

export function RegistrationPanel({
  gameDayId,
  price,
  pixKey,
  registration,
  open,
  full,
}: {
  gameDayId: string;
  price: string;
  pixKey: string | null;
  registration: Registration | null;
  open: boolean;
  full: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [method, setMethod] = useState<"PIX" | "ON_SITE">("PIX");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function uploadReceipt(file: File) {
    setUploading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("tipo", "comprovante");
      const response = await fetch("/api/uploads", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao enviar o comprovante.");
      setReceiptUrl(body.url);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function subscribe() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/peladas/${gameDayId}/inscricoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: method, receiptUrl }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível inscrever.");
      toast.show({ message: "Inscrição feita. Boa pelada!", tone: "success" });
      router.refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function cancel() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/peladas/${gameDayId}/inscricoes`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível cancelar.");
      toast.show({ message: "Inscrição cancelada." });
      router.refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (registration) {
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
            <a
              href={registration.receiptUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm text-pitch-400 underline underline-offset-4"
            >
              <Receipt size={15} /> Ver meu comprovante
            </a>
          ) : null}

          {open ? (
            <Button variant="secondary" onClick={cancel} disabled={saving}>
              Cancelar inscrição
            </Button>
          ) : (
            <p className="text-xs text-slate-500">
              Os times já foram montados. Para sair, fale com o organizador.
            </p>
          )}

          {message ? <p className="text-sm text-rose-300">{message}</p> : null}
        </Card>
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
          <div className="grid gap-3">
            {pixKey ? (
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(pixKey);
                  toast.show({ message: "Chave PIX copiada." });
                }}
                className="flex items-center justify-between gap-2 rounded-xl bg-night-800 px-3 py-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-xs text-slate-500">Chave PIX</span>
                  <span className="block truncate text-sm text-slate-200">{pixKey}</span>
                </span>
                <Copy size={16} className="shrink-0 text-slate-400" />
              </button>
            ) : (
              <p className="text-sm text-slate-400">O organizador não cadastrou chave PIX.</p>
            )}

            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadReceipt(file);
              }}
            />

            <Button
              type="button"
              variant={receiptUrl ? "outline" : "secondary"}
              size="lg"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : receiptUrl ? (
                <Check size={16} />
              ) : (
                <Receipt size={16} />
              )}
              {receiptUrl ? "Comprovante anexado" : "Anexar comprovante"}
            </Button>
          </div>
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

        <Button size="lg" onClick={subscribe} disabled={saving || uploading || full}>
          {saving ? "Inscrevendo..." : "Confirmar inscrição"}
        </Button>
      </Card>
    </section>
  );
}
