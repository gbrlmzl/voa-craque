"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { Button, Card, Field, Textarea, cn } from "@/components/ui";

export function SystemSettingsForm({
  initial,
}: {
  initial: { publicAccessEnabled: boolean; registrationOpen: boolean; maintenanceMessage: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/sistema", {
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

  return (
    <Card className="grid gap-4">
      <Toggle
        label="Site liberado"
        description="Desligado, todo mundo vê a página de manutenção. Você continua entrando normalmente."
        checked={values.publicAccessEnabled}
        onChange={(checked) => setValues((current) => ({ ...current, publicAccessEnabled: checked }))}
      />

      <Toggle
        label="Inscrições abertas"
        description="Desligado, ninguém entra em pelada nenhuma até você religar."
        checked={values.registrationOpen}
        onChange={(checked) => setValues((current) => ({ ...current, registrationOpen: checked }))}
      />

      <Field label="Mensagem de manutenção">
        <Textarea
          value={values.maintenanceMessage}
          onChange={(event) =>
            setValues((current) => ({ ...current, maintenanceMessage: event.target.value }))
          }
        />
      </Field>

      <Button size="lg" onClick={save} disabled={saving}>
        {saving ? "Salvando..." : "Salvar"}
      </Button>
    </Card>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-start gap-3 rounded-xl bg-night-800 p-3 text-left"
    >
      <span
        className={cn(
          "mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
          checked ? "bg-pitch-500" : "bg-slate-600",
        )}
      >
        <span
          className={cn(
            "h-5 w-5 rounded-full bg-white transition-transform",
            checked && "translate-x-5",
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-100">{label}</span>
        <span className="block text-xs text-slate-500">{description}</span>
      </span>
    </button>
  );
}
