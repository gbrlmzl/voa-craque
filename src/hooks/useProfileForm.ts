"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { useUpdateCurrentUser } from "@/components/providers/UserProvider";
import type { ProfileValues } from "@/lib/profile-defaults";

export function useProfileForm(initial: ProfileValues, mode: "onboarding" | "edit") {
  const router = useRouter();
  const toast = useToast();
  const updateCurrentUser = useUpdateCurrentUser();

  const [values, setValues] = useState<ProfileValues>(initial);
  // Ultimo estado salvo: "cancelar" volta para ele.
  const [saved, setSaved] = useState<ProfileValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = <K extends keyof ProfileValues>(key: K, value: ProfileValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  function reset() {
    setValues(saved);
    setErrors({});
    setMessage(null);
  }

  /** Envia a foto e devolve a URL, ou null se falhou (a mensagem fica em `message`). */
  async function uploadPhoto(file: File): Promise<string | null> {
    setUploading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("tipo", "foto");
      const response = await fetch("/api/uploads", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha no envio da foto.");
      set("photoUrl", body.url);
      return body.url as string;
    } catch (error) {
      setMessage((error as Error).message);
      return null;
    } finally {
      setUploading(false);
    }
  }

  /** Salva `next` (padrao: os valores atuais). Devolve true se o servidor aceitou. */
  async function save(next: ProfileValues = values): Promise<boolean> {
    setSaving(true);
    setErrors({});
    setMessage(null);

    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const body = await response.json();

      if (!response.ok) {
        if (body.details && typeof body.details === "object") setErrors(body.details);
        throw new Error(body.error ?? "Não foi possível salvar.");
      }

      setSaved(next);

      if (mode === "onboarding") {
        // O servidor precisa reavaliar profileCompleted: aqui o refresh e necessario.
        router.replace("/");
        router.refresh();
      } else {
        // Nada nesta tela depende do servidor alem da foto no cabecalho, que o
        // contexto atualiza sem ida e volta.
        if (next.photoUrl) updateCurrentUser({ photoUrl: next.photoUrl });
        toast.show({ message: "Perfil atualizado.", tone: "success" });
      }
      return true;
    } catch (error) {
      setMessage((error as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await save();
  }

  return { values, set, errors, message, saving, uploading, uploadPhoto, save, reset, submit };
}
