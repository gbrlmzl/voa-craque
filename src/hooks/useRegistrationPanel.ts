"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { RECEIPT_MAX_MB, checkImageFile } from "@/lib/upload-rules";

export type Registration = {
  id: string;
  paymentMethod: "PIX" | "ON_SITE";
  paymentStatus: "PENDING" | "CONFIRMED" | "REJECTED";
  receiptUrl: string | null;
  rejectedReason: string | null;
};

/** Arquivo escolhido e a URL local (blob:) que mostra a previa sem enviar nada. */
type PickedReceipt = { file: File; previewUrl: string };

export function useRegistrationPanel(gameDayId: string) {
  const router = useRouter();
  const toast = useToast();

  const [method, setMethod] = useState<"PIX" | "ON_SITE">("PIX");
  // Arquivo escolhido, aberto no modal de previa (Cancelar | Confirmar).
  const [reviewing, setReviewing] = useState<PickedReceipt | null>(null);
  // Arquivo confirmado, preparado: so sobe quando o jogador toca em "Confirmar inscricao".
  const [receipt, setReceipt] = useState<PickedReceipt | null>(null);
  // Cache do envio: se o POST da inscricao falhar depois de o arquivo subir, nao reenvia na proxima tentativa.
  const [uploaded, setUploaded] = useState<{ file: File; url: string } | null>(null);
  const [viewingPrepared, setViewingPrepared] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState(false);

  // Espelho para revogar as URLs blob: no desmonte sem depender de closure velha.
  const live = useRef<{ reviewing: PickedReceipt | null; receipt: PickedReceipt | null }>({
    reviewing: null,
    receipt: null,
  });
  useEffect(() => {
    live.current = { reviewing, receipt };
  }, [reviewing, receipt]);
  useEffect(
    () => () => {
      if (live.current.reviewing) URL.revokeObjectURL(live.current.reviewing.previewUrl);
      if (live.current.receipt) URL.revokeObjectURL(live.current.receipt.previewUrl);
    },
    [],
  );

  /** Confere o arquivo e abre a previa. Nao envia nada. */
  function pickReceipt(file: File) {
    const problem = checkImageFile(file, RECEIPT_MAX_MB);
    if (problem) {
      setMessage(problem);
      return;
    }
    setMessage(null);
    if (reviewing) URL.revokeObjectURL(reviewing.previewUrl);
    setReviewing({ file, previewUrl: URL.createObjectURL(file) });
  }

  function cancelReview() {
    if (reviewing) URL.revokeObjectURL(reviewing.previewUrl);
    setReviewing(null);
  }

  function confirmReview() {
    if (!reviewing) return;
    if (receipt) URL.revokeObjectURL(receipt.previewUrl);
    setReceipt(reviewing);
    setReviewing(null);
  }

  function removeReceipt() {
    if (receipt) URL.revokeObjectURL(receipt.previewUrl);
    setReceipt(null);
    setUploaded(null);
    setViewingPrepared(false);
  }

  /** So envia e devolve a URL; quem chama cuida do estado de tela. */
  async function uploadReceipt(file: File): Promise<string> {
    const form = new FormData();
    form.set("file", file);
    form.set("tipo", "comprovante");
    const response = await fetch("/api/uploads", { method: "POST", body: form });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Falha ao enviar o comprovante.");
    return body.url as string;
  }

  async function subscribe() {
    if (method === "PIX" && !receipt) {
      setMessage("Anexe o comprovante do PIX.");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      // Com "No local" nada e enviado, mesmo que haja comprovante preparado (ele fica guardado se voltar para PIX).
      let receiptUrl = "";
      if (method === "PIX" && receipt) {
        if (uploaded?.file === receipt.file) {
          receiptUrl = uploaded.url;
        } else {
          setUploading(true);
          try {
            receiptUrl = await uploadReceipt(receipt.file);
          } finally {
            setUploading(false);
          }
          setUploaded({ file: receipt.file, url: receiptUrl });
        }
      }

      const response = await fetch(`/api/game-days/${gameDayId}/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: method, receiptUrl }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível inscrever.");

      if (receipt) URL.revokeObjectURL(receipt.previewUrl);
      setReceipt(null);
      setUploaded(null);
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
      const response = await fetch(`/api/game-days/${gameDayId}/registrations`, { method: "DELETE" });
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

  function copyPixKey(pixKey: string) {
    void navigator.clipboard?.writeText(pixKey);
    toast.show({ message: "Chave PIX copiada." });
  }

  return {
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
    cancel,
    copyPixKey,
  };
}
