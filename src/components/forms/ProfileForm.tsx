"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Avatar } from "@/components/player";
import { useToast } from "@/components/toast";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { useUpdateCurrentUser } from "@/components/UserProvider";

export type ProfileValues = {
  nickname: string;
  foot: string;
  position: string;
  age: string;
  heightCm: string;
  weightKg: string;
  course: string;
  courseName: string;
  photoUrl: string;
};

export const EMPTY_PROFILE: ProfileValues = {
  nickname: "",
  foot: "RIGHT",
  position: "ALA",
  age: "",
  heightCm: "",
  weightKg: "",
  course: "LCC",
  courseName: "",
  photoUrl: "",
};

export function ProfileForm({
  name,
  initial,
  mode,
}: {
  name: string;
  initial: ProfileValues;
  mode: "onboarding" | "edit";
}) {
  const router = useRouter();
  const toast = useToast();
  const updateCurrentUser = useUpdateCurrentUser();
  const fileInput = useRef<HTMLInputElement>(null);

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
      const response = await fetch("/api/perfil", {
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

  return (
    <Card>
      <form onSubmit={submit} className="grid gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={name} photoUrl={values.photoUrl || null} size="lg" />
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

        <Field label="Apelido na quadra" hint="Como o pessoal te chama." error={errors.nickname}>
          <Input
            value={values.nickname}
            onChange={(event) => set("nickname", event.target.value)}
            placeholder="Opcional"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Pé que chuta" error={errors.foot}>
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

        <Field label="Curso" error={errors.course}>
          <Select value={values.course} onChange={(event) => set("course", event.target.value)}>
            <option value="LCC">LCC</option>
            <option value="SI">SI</option>
            <option value="OTHER">Outro</option>
          </Select>
        </Field>

        {values.course === "OTHER" ? (
          <Field label="Qual curso?" error={errors.courseName}>
            <Input
              value={values.courseName}
              onChange={(event) => set("courseName", event.target.value)}
              required
            />
          </Field>
        ) : null}

        <p className="rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-400">
          As estrelas de habilidade e as skills são definidas pelo organizador, não por você.
        </p>

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
