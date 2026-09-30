"use client";

import { useActionState } from "react";
import { resetPasswordAction } from "@/actions/password";
import type { FormState } from "@/actions/auth";
import { Button, Card, Field, Input } from "@/components/ui";

const EMPTY: FormState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, EMPTY);

  return (
    <Card>
      <form action={action} className="grid gap-4">
        <input type="hidden" name="token" value={token} />

        <Field label="Senha nova" hint="Mínimo de 8 caracteres." error={state.fieldErrors?.password}>
          <Input name="password" type="password" autoComplete="new-password" required />
        </Field>

        <Field label="Repita a senha nova" error={state.fieldErrors?.passwordConfirm}>
          <Input name="passwordConfirm" type="password" autoComplete="new-password" required />
        </Field>

        {state.message ? (
          <p role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {state.message}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Salvando..." : "Salvar nova senha"}
        </Button>
      </form>
    </Card>
  );
}
