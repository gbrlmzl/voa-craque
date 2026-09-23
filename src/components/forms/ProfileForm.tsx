"use client";

import { useRef } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Avatar } from "@/components/Player";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { useProfileForm } from "@/hooks/useProfileForm";
import type { ProfileValues } from "@/lib/profile-defaults";

export function ProfileForm({
  initial,
  mode,
}: {
  initial: ProfileValues;
  mode: "onboarding" | "edit";
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { values, set, errors, message, saving, uploading, uploadPhoto, submit } = useProfileForm(initial, mode);

  return (
    <Card>
      <form onSubmit={submit} className="grid gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={values.name || "?"} photoUrl={values.photoUrl || null} size="lg" />
          <div>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadPhoto(file);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
              {values.photoUrl ? "Trocar foto" : "Adicionar foto"}
            </Button>
            <p className="mt-1 text-xs text-slate-500">JPEG, PNG ou WebP, até 5 MB.</p>
          </div>
        </div>

        <Field label="Nome" error={errors.name}>
          <Input
            value={values.name}
            onChange={(event) => set("name", event.target.value)}
            placeholder="Seu nome"
            required
          />
        </Field>

        <Field label="Vulgo" hint="Como o pessoal te chama." error={errors.nickname}>
          <Input
            value={values.nickname}
            onChange={(event) => set("nickname", event.target.value)}
            placeholder="Opcional"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Melhor pé" error={errors.foot}>
            <Select value={values.foot} onChange={(event) => set("foot", event.target.value)}>
              <option value="RIGHT">Destro</option>
              <option value="LEFT">Canhoto</option>
              <option value="BOTH">Ambidestro</option>
            </Select>
          </Field>

          <Field label="Posição" error={errors.position}>
            <Select value={values.position} onChange={(event) => set("position", event.target.value)}>
              <option value="GOALKEEPER">Goleiro</option>
              <option value="FIXO">Fixo</option>
              <option value="ALA">Ala</option>
              <option value="PIVO">Pivô</option>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Idade" error={errors.age}>
            <Input
              inputMode="numeric"
              value={values.age}
              onChange={(event) => set("age", event.target.value)}
              placeholder="21"
              required
            />
          </Field>

          <Field label="Altura (cm)" error={errors.heightCm}>
            <Input
              inputMode="numeric"
              value={values.heightCm}
              onChange={(event) => set("heightCm", event.target.value)}
              placeholder="178"
              required
            />
          </Field>

          <Field label="Peso (kg)" error={errors.weightKg}>
            <Input
              inputMode="numeric"
              value={values.weightKg}
              onChange={(event) => set("weightKg", event.target.value)}
              placeholder="75"
              required
            />
          </Field>
        </div>

        {message ? (
          <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{message}</p>
        ) : null}

        <Button type="submit" size="lg" disabled={saving || uploading}>
          {saving ? "Salvando..." : mode === "onboarding" ? "Salvar e entrar" : "Salvar alterações"}
        </Button>
      </form>
    </Card>
  );
}
