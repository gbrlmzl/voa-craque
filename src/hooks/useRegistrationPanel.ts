"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";

export type Registration = {
  id: string;
  paymentMethod: "PIX" | "ON_SITE";
  paymentStatus: "PENDING" | "CONFIRMED" | "REJECTED";
  receiptUrl: string | null;
  rejectedReason: string | null;
};

export function useRegistrationPanel(gameDayId: string) {
  const router = useRouter();
  const toast = useToast();

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
      const response = await fetch(`/api/game-days/${gameDayId}/registrations`, {
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
    receiptUrl,
    uploading,
    uploadReceipt,
    saving,
    message,
    subscribe,
    cancel,
    copyPixKey,
  };
}
