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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = <K extends keyof ProfileValues>(key: K, value: ProfileValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function uploadPhoto(file: File) {
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
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setMessage(null);

    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await response.json();

      if (!response.ok) {
        if (body.details && typeof body.details === "object") setErrors(body.details);
        throw new Error(body.error ?? "Não foi possível salvar.");
      }

      if (mode === "onboarding") {
        // O servidor precisa reavaliar profileCompleted: aqui o refresh e necessario.
        router.replace("/");
        router.refresh();
      } else {
        // Nada nesta tela depende do servidor alem da foto no cabecalho, que o
        // contexto atualiza sem ida e volta.
        if (values.photoUrl) updateCurrentUser({ photoUrl: values.photoUrl });
        toast.show({ message: "Perfil atualizado.", tone: "success" });
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return { values, set, errors, message, saving, uploading, uploadPhoto, submit };
}
