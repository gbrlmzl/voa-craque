"use client";

import { useActionState } from "react";
import { loginAction, type FormState } from "@/actions/auth";
import { Button, Card, Field, Input } from "@/components/ui";

const EMPTY: FormState = {};

export function LoginForm({
  next,
  notice,
  googleEnabled,
}: {
  next?: string;
  /** Erro que veio na URL (retorno do Google), mostrado ate a primeira tentativa. */
  notice?: string;
  googleEnabled: boolean;
}) {
  const [state, action, pending] = useActionState(loginAction, EMPTY);
  const message = state === EMPTY ? notice : state.message;

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

        {message ? (
          <p role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {message}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Entrando..." : "Entrar"}
        </Button>

        {googleEnabled ? (
          <p className="text-center text-xs text-slate-500">
            Conta vinculada ao Google entra só pelo botão do Google.
          </p>
        ) : null}
      </form>
    </Card>
  );
}
