"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { loginAction, type FormState } from "@/actions/auth";
import { AUTH_SUBMIT } from "@/components/ui/controlStyles";
import { Button, Card, Checkbox, FloatingInput } from "@/components/ui";

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

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [keepLoggedIn, setKeepLoggedIn] = useState(false);
  const filled = username.trim().length > 0 && password.length > 0;

  // Login recusado: o usuario fica, a senha sai.
  useEffect(() => {
    if (state !== EMPTY && !state.ok) setPassword("");
  }, [state]);

  return (
    <Card>
      <form action={action} className="grid gap-4">
        <input type="hidden" name="proximo" value={next ?? "/"} />

        <FloatingInput
          label="Usuário"
          name="username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={state.fieldErrors?.username}
          disabled={pending}
          required
        />

        <FloatingInput
          label="Senha"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={state.fieldErrors?.password}
          disabled={pending}
          required
        />

        <div className="-mt-2 flex items-center justify-between gap-3">
          <Checkbox
            name="keepLoggedIn"
            label="Manter login"
            size="sm"
            checked={keepLoggedIn}
            onChange={(e) => setKeepLoggedIn(e.target.checked)}
            disabled={pending}
          />
          <Link href="/forgot-password" className="text-xs text-slate-400 underline underline-offset-4">
            Esqueci minha senha
          </Link>
        </div>

        {message ? (
          <p role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {message}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={pending || !filled} className={AUTH_SUBMIT}>
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
