"use client";

import { useActionState } from "react";
import { forgotPasswordAction } from "@/actions/password";
import type { FormState } from "@/actions/auth";
import { Button, Card, Field, Input } from "@/components/ui";

const EMPTY: FormState = {};

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, EMPTY);

  if (state.ok) {
    return (
      <Card>
        <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{state.message}</p>
      </Card>
    );
  }

  return (
    <Card>
      <form action={action} className="grid gap-4">
        <Field label="E-mail" error={state.fieldErrors?.email}>
          <Input name="email" type="email" autoComplete="email" inputMode="email" required />
        </Field>

        {state.message ? (
          <p role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {state.message}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Enviando..." : "Enviar link"}
        </Button>
      </form>
    </Card>
  );
}
