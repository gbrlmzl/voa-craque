"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";

export type GameDayValues = {
  title: string;
  scheduledAt: string;
  location: string;
  price: string;
  durationMin: string;
  goalsToWin: string;
  maxPlayers: string;
  teamSize: string;
  pixKey: string;
  notes: string;
};

export const NEW_GAMEDAY: GameDayValues = {
  title: "",
  scheduledAt: "",
  location: "",
  price: "4,50",
  durationMin: "10",
  goalsToWin: "2",
  maxPlayers: "20",
  teamSize: "5",
  pixKey: "",
  notes: "",
};

function toCents(value: string): number {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : Number.NaN;
}

export function GameDayForm({
  initial,
  gameDayId,
}: {
  initial: GameDayValues;
  gameDayId?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof GameDayValues>(key: K, value: GameDayValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setMessage(null);

    const payload = {
      title: values.title,
      scheduledAt: values.scheduledAt,
      location: values.location,
      pricePerPlayerCents: toCents(values.price),
      matchDurationSec: Number(values.durationMin) * 60,
      goalsToWin: Number(values.goalsToWin),
      maxPlayers: Number(values.maxPlayers),
      teamSize: Number(values.teamSize),
      pixKey: values.pixKey,
      notes: values.notes,
    };

    try {
      const response = await fetch(gameDayId ? `/api/peladas/${gameDayId}` : "/api/peladas", {
        method: gameDayId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();

      if (!response.ok) {
        if (body.details && typeof body.details === "object") setErrors(body.details);
        throw new Error(body.error ?? "Não foi possível salvar a pelada.");
      }

      router.push(gameDayId ? `/peladas/${gameDayId}` : `/peladas/${body.id}`);
      router.refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Nome da pelada" error={errors.title}>
          <Input
            value={values.title}
            onChange={(event) => set("title", event.target.value)}
            placeholder="Pelada de quinta"
            required
          />
        </Field>

        <Field label="Data e hora" error={errors.scheduledAt}>
          <Input
            type="datetime-local"
            value={values.scheduledAt}
            onChange={(event) => set("scheduledAt", event.target.value)}
            required
          />
        </Field>

        <Field label="Local" error={errors.location}>
          <Input
            value={values.location}
            onChange={(event) => set("location", event.target.value)}
            placeholder="Ginásio do campus"
            required
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Preço por jogador" hint="Em reais." error={errors.pricePerPlayerCents}>
            <Input
              inputMode="decimal"
              value={values.price}
              onChange={(event) => set("price", event.target.value)}
              required
            />
          </Field>

          <Field label="Duração da partida" hint="Em minutos." error={errors.matchDurationSec}>
            <Input
              inputMode="numeric"
              value={values.durationMin}
              onChange={(event) => set("durationMin", event.target.value)}
              required
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Gols p/ vencer" error={errors.goalsToWin}>
            <Input
              inputMode="numeric"
              value={values.goalsToWin}
              onChange={(event) => set("goalsToWin", event.target.value)}
              required
            />
          </Field>

          <Field label="Máx. jogadores" error={errors.maxPlayers}>
            <Input
              inputMode="numeric"
              value={values.maxPlayers}
              onChange={(event) => set("maxPlayers", event.target.value)}
              required
            />
          </Field>

          <Field label="Por time" error={errors.teamSize}>
            <Select value={values.teamSize} onChange={(event) => set("teamSize", event.target.value)}>
              {[3, 4, 5, 6, 7].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Chave PIX" hint="Aparece para quem escolher pagar por PIX." error={errors.pixKey}>
          <Input value={values.pixKey} onChange={(event) => set("pixKey", event.target.value)} />
        </Field>

        <Field label="Observações" error={errors.notes}>
          <Textarea
            value={values.notes}
            onChange={(event) => set("notes", event.target.value)}
            placeholder="Leve camisa clara e escura."
          />
        </Field>

        {message ? (
          <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{message}</p>
        ) : null}

        <Button type="submit" size="lg" disabled={saving}>
          {saving ? "Salvando..." : gameDayId ? "Salvar alterações" : "Criar pelada"}
        </Button>
      </form>
    </Card>
  );
}
