"use client";

import { useActionState } from "react";
import { loginAction, type FormState } from "@/actions/auth";
import { Button, Card, Field, Input } from "@/components/ui";

const EMPTY: FormState = {};

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, EMPTY);

  return (
    <Card>
      <form action={action} className="grid gap-4">
        <input type="hidden" name="proximo" value={next ?? "/"} />

        <Field label="E-mail" error={state.fieldErrors?.email}>
          <Input
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="voce@aluno.edu.br"
            required
          />
        </Field>

        <Field label="Senha" error={state.fieldErrors?.password}>
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>

        {state.message ? (
          <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{state.message}</p>
        ) : null}

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Entrando..." : "Entrar"}
        </Button>
      </form>
    </Card>
  );
}
