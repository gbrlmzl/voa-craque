"use client";

import { Button, Card, Field, Textarea, cn } from "@/components/ui";
import { type SystemSettingsValues, useSystemSettingsForm } from "@/hooks/useSystemSettingsForm";

export function SystemSettingsForm({ initial }: { initial: SystemSettingsValues }) {
  const { values, set, saving, save } = useSystemSettingsForm(initial);

  return (
    <Card className="grid gap-4">
      <Toggle
        label="Site liberado"
        description="Desligado, todo mundo vê a página de manutenção. Você continua entrando normalmente."
        checked={values.publicAccessEnabled}
        onChange={(checked) => set("publicAccessEnabled", checked)}
      />

      <Toggle
        label="Site privado"
        description="Ligado, só quem tem conta e está logado acessa o site. Desligado, qualquer pessoa vê as peladas, o ranking e o ao vivo; para se inscrever, precisa entrar."
        checked={values.privateSiteEnabled}
        onChange={(checked) => set("privateSiteEnabled", checked)}
      />

      {!values.publicAccessEnabled ? (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          O site está em manutenção: ninguém navega até você liberar.
        </p>
      ) : null}

      <Toggle
        label="Inscrições abertas"
        description="Desligado, ninguém entra em pelada nenhuma até você religar."
        checked={values.registrationOpen}
        onChange={(checked) => set("registrationOpen", checked)}
      />

      <Field label="Mensagem de manutenção">
        <Textarea
          value={values.maintenanceMessage}
          onChange={(event) => set("maintenanceMessage", event.target.value)}
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
