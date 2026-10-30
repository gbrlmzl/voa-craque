"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { useUpdateCurrentUser } from "@/components/providers/UserProvider";
import { shrinkBeforeUpload } from "@/lib/client-image";
import { type ProfileValues, profileChanged } from "@/lib/profile-defaults";
import { PHOTO_MAX_MB, checkImageFile } from "@/lib/upload-rules";

/** Foto escolhida na edicao: so vai para o servidor no "Salvar". */
type PendingPhoto = {
  file: File;
  previewUrl: string;
  /** Preenchido quando o envio deu certo mas o PUT do perfil falhou: nao reenvia a foto. */
  uploadedUrl?: string;
};

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
  const [preparing, setPreparing] = useState(false);
  // O onboarding nasce como formulario; o perfil so vira formulario ao clicar no lapis.
  const [editing, setEditing] = useState(mode === "onboarding");
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);

  // Espelho do estado para revogar a URL no desmonte sem depender de closure velha.
  const pendingRef = useRef<PendingPhoto | null>(null);
  useEffect(() => {
    pendingRef.current = pendingPhoto;
  }, [pendingPhoto]);
  useEffect(
    () => () => {
      if (pendingRef.current) URL.revokeObjectURL(pendingRef.current.previewUrl);
    },
    [],
  );

  const dirty = editing && (profileChanged(values, saved) || pendingPhoto !== null);
  const photoShown = pendingPhoto?.previewUrl ?? values.photoUrl;

  const set = <K extends keyof ProfileValues>(key: K, value: ProfileValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  function dropPendingPhoto() {
    if (pendingRef.current) URL.revokeObjectURL(pendingRef.current.previewUrl);
    pendingRef.current = null;
    setPendingPhoto(null);
  }

  function reset() {
    setValues(saved);
    setErrors({});
    setMessage(null);
    dropPendingPhoto();
  }

  function cancelEditing() {
    reset();
    setEditing(false);
  }

  /** Confere e prepara a foto escolhida; nada vai para o servidor ainda. */
  async function pickPhoto(file: File) {
    const problem = checkImageFile(file, PHOTO_MAX_MB);
    if (problem) {
      setMessage(problem);
      return;
    }
    setMessage(null);
    setPreparing(true);
    try {
      const prepared = await shrinkBeforeUpload(file);
      if (pendingRef.current) URL.revokeObjectURL(pendingRef.current.previewUrl);
      const next = { file: prepared, previewUrl: URL.createObjectURL(prepared) };
      pendingRef.current = next;
      setPendingPhoto(next);
    } finally {
      setPreparing(false);
    }
  }

  async function uploadPhoto(file: File): Promise<string> {
    const form = new FormData();
    form.set("file", file);
    form.set("tipo", "foto");
    const response = await fetch("/api/uploads", { method: "POST", body: form });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Falha no envio da foto.");
    return body.url as string;
  }

  /** Envia a foto (se mudou) e grava o perfil. Devolve true se o servidor aceitou. */
  async function save(): Promise<boolean> {
    setSaving(true);
    setErrors({});
    setMessage(null);

    try {
      let photoUrl = values.photoUrl;
      const photo = pendingPhoto;

      if (photo) {
        let uploadedUrl = photo.uploadedUrl;
        if (!uploadedUrl) {
          setUploading(true);
          try {
            uploadedUrl = await uploadPhoto(photo.file);
          } finally {
            setUploading(false);
          }
          // Guarda a URL: se o PUT abaixo falhar, a proxima tentativa nao reenvia a foto.
          const withUrl = { ...photo, uploadedUrl };
          pendingRef.current = withUrl;
          setPendingPhoto(withUrl);
        }
        photoUrl = uploadedUrl;
      }

      const next = { ...values, photoUrl };
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

      setValues(next);
      setSaved(next);
      dropPendingPhoto();

      if (mode === "onboarding") {
        // O servidor precisa reavaliar profileCompleted: aqui o refresh e necessario.
        router.replace("/");
        router.refresh();
      } else {
        // Nada nesta tela depende do servidor alem da foto no cabecalho, que o
        // contexto atualiza sem ida e volta.
        if (next.photoUrl) updateCurrentUser({ photoUrl: next.photoUrl });
        toast.show({ message: "Perfil atualizado.", tone: "success" });
        setEditing(false);
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

  return {
    values,
    set,
    errors,
    message,
    saving,
    uploading,
    preparing,
    editing,
    startEditing: () => setEditing(true),
    cancelEditing,
    dirty,
    photoShown,
    hasPendingPhoto: pendingPhoto !== null,
    pickPhoto,
    undoPhoto: dropPendingPhoto,
    save,
    submit,
  };
}
