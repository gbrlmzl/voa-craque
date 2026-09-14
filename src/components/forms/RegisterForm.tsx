"use client";

import { useActionState } from "react";
import { registerAction, type FormState } from "@/actions/auth";
import { Button, Card, Field, Input } from "@/components/ui";

const EMPTY: FormState = {};

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, EMPTY);

  return (
    <Card>
      <form action={action} className="grid gap-4">
        <Field label="Nome completo" error={state.fieldErrors?.name}>
          <Input name="name" autoComplete="name" placeholder="Como te chamam na chamada" required />
        </Field>

        <Field label="E-mail" error={state.fieldErrors?.email}>
          <Input name="email" type="email" autoComplete="email" inputMode="email" required />
        </Field>

        <Field label="Senha" hint="Mínimo de 8 caracteres." error={state.fieldErrors?.password}>
          <Input name="password" type="password" autoComplete="new-password" required />
        </Field>

        <Field label="Repita a senha" error={state.fieldErrors?.passwordConfirm}>
          <Input name="passwordConfirm" type="password" autoComplete="new-password" required />
        </Field>

        {state.message ? (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{state.message}</p>
        ) : null}

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Criando..." : "Criar conta"}
        </Button>
      </form>
    </Card>
  );
}
