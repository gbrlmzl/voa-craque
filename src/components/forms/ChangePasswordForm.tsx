"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePasswordAction } from "@/actions/password";
import type { FormState } from "@/actions/auth";
import { Button, Field, Input } from "@/components/ui";

const EMPTY: FormState = {};

export function ChangePasswordForm({
  username,
  onSuccess,
}: {
  username: string;
  onSuccess?: () => void;
}) {
  const [state, action, pending] = useActionState(changePasswordAction, EMPTY);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
    onSuccess?.();
  }, [state, onSuccess]);

  return (
    <form ref={formRef} action={action} className="grid gap-4">
      {/* Gerenciadores de senha associam a troca a esta conta pelo username. */}
      <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />

      <Field label="Senha atual" error={state.fieldErrors?.currentPassword}>
        <Input name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>

      <Field label="Senha nova" hint="Mínimo de 8 caracteres." error={state.fieldErrors?.newPassword}>
        <Input name="newPassword" type="password" autoComplete="new-password" required />
      </Field>

      <Field label="Repita a senha nova" error={state.fieldErrors?.newPasswordConfirm}>
        <Input name="newPasswordConfirm" type="password" autoComplete="new-password" required />
      </Field>

      {state.ok ? (
        <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{state.message}</p>
      ) : state.message ? (
        <p role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {state.message}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Salvando..." : "Alterar senha"}
      </Button>
    </form>
  );
}
