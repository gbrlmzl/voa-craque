"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Pencil } from "lucide-react";
import { Avatar, Stars } from "@/components/Player";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { useProfileForm } from "@/hooks/useProfileForm";
import { FOOT_LABEL, POSITION_LABEL } from "@/lib/labels";
import type { ProfileValues } from "@/lib/profile-defaults";

export function ProfileForm({
  initial,
  mode,
}: {
  initial: ProfileValues;
  mode: "onboarding" | "edit";
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const {
    values,
    set,
    errors,
    message,
    saving,
    uploading,
    uploadPhoto,
    save,
    reset,
  } = useProfileForm(initial, mode);

  // O onboarding nasce como formulario; o perfil so vira formulario ao clicar no lapis.
  const [editing, setEditing] = useState(mode === "onboarding");

  async function onPickPhoto(file: File) {
    const url = await uploadPhoto(file);
    // Fora da edicao nao ha botao "Salvar": a foto nova e gravada na hora.
    if (url && !editing) await save({ ...values, photoUrl: url });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (await save()) setEditing(mode === "onboarding");
  }

  function cancelEditing() {
    reset();
    setEditing(false);
  }

  return (
    <Card className="relative">
      {mode === "edit" && !editing ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Editar dados"
          title="Editar"
          className="absolute top-3 right-3 grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pitch-400"
        >
          <Pencil size={18} />
        </button>
      ) : null}

      <div className="grid gap-4">
        <div className="flex flex-col items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void onPickPhoto(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading || saving}
            aria-label={values.photoUrl ? "Trocar foto" : "Adicionar foto"}
            title="JPEG, PNG ou WebP, até 5 MB"
            className="group relative rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pitch-400"
          >
            <Avatar
              name={values.name || "?"}
              photoUrl={values.photoUrl || null}
              size="xl"
            />
            <span
              className={
                "absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white/80 transition-opacity " +
                (uploading
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100")
              }
            >
              {uploading ? (
                <Loader2 size={28} className="animate-spin" />
              ) : (
                <Camera size={28} />
              )}
            </span>
          </button>

          <Card className="px-3 py-2">
            <Stars value={values.stars ?? null} size={20} />
          </Card>
        </div>

        {editing ? (
          <form onSubmit={onSubmit} className="grid gap-4">
            <Field label="Nome" error={errors.name}>
              <Input
                value={values.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder="Seu nome"
                required
              />
            </Field>

            <Field
              label="Vulgo"
              hint="Como o pessoal te chama."
              error={errors.nickname}
            >
              <Input
                value={values.nickname}
                onChange={(event) => set("nickname", event.target.value)}
                placeholder="Opcional"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Melhor pé" error={errors.foot}>
                <Select
                  value={values.foot}
                  onChange={(event) => set("foot", event.target.value)}
                >
                  <option value="RIGHT">Destro</option>
                  <option value="LEFT">Canhoto</option>
                  <option value="BOTH">Ambidestro</option>
                </Select>
              </Field>

              <Field label="Posição" error={errors.position}>
                <Select
                  value={values.position}
                  onChange={(event) => set("position", event.target.value)}
                >
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
              <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                {message}
              </p>
            ) : null}

            <div className="grid gap-2">
              <Button type="submit" size="lg" disabled={saving || uploading}>
                {saving
                  ? "Salvando..."
                  : mode === "onboarding"
                    ? "Salvar e entrar"
                    : "Salvar alterações"}
              </Button>
              {mode === "edit" ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={cancelEditing}
                  disabled={saving}
                >
                  Cancelar
                </Button>
              ) : null}
            </div>
          </form>
        ) : (
          <>
            <dl className="grid gap-3">
              <ReadOnlyField label="Nome" value={values.name} />
              <ReadOnlyField label="Vulgo" value={values.nickname} />
              <div className="grid grid-cols-2 gap-3">
                <ReadOnlyField
                  label="Melhor pé"
                  value={FOOT_LABEL[values.foot as keyof typeof FOOT_LABEL]}
                />
                <ReadOnlyField
                  label="Posição"
                  value={POSITION_LABEL[values.position as keyof typeof POSITION_LABEL]}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <ReadOnlyField label="Idade" value={values.age} />
                <ReadOnlyField
                  label="Altura"
                  value={values.heightCm ? `${values.heightCm} cm` : ""}
                />
                <ReadOnlyField
                  label="Peso"
                  value={values.weightKg ? `${values.weightKg} kg` : ""}
                />
              </div>
            </dl>

            {message ? (
              <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                {message}
              </p>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}

function ReadOnlyField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-100">{value || "—"}</dd>
    </div>
  );
}
