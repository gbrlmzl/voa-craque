"use client";

import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { type GameDayValues, useGameDayForm } from "@/hooks/useGameDayForm";

export type { GameDayValues } from "@/hooks/useGameDayForm";
export { NEW_GAMEDAY } from "@/hooks/useGameDayForm";

export function GameDayForm({
  initial,
  gameDayId,
}: {
  initial: GameDayValues;
  gameDayId?: string;
}) {
  const { values, set, errors, message, saving, submit } = useGameDayForm(initial, gameDayId);

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
