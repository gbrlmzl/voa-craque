"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";

export type SystemSettingsValues = {
  publicAccessEnabled: boolean;
  registrationOpen: boolean;
  maintenanceMessage: string;
};

export function useSystemSettingsForm(initial: SystemSettingsValues) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof SystemSettingsValues>(key: K, value: SystemSettingsValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/system", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível salvar.");
      toast.show({ message: "Configuração salva.", tone: "success" });
      router.refresh();
    } catch (error) {
      toast.show({ message: (error as Error).message, tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return { values, set, saving, save };
}
