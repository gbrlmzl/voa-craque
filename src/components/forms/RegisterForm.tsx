"use client";

import { useActionState, useState } from "react";
import { registerAction, type FormState } from "@/actions/auth";
import { checkPassword } from "@/lib/password-rules";
import { AUTH_SUBMIT } from "@/components/ui/controlStyles";
import { Button, Card, FloatingInput, PasswordRequirement } from "@/components/ui";

const EMPTY: FormState = {};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(registerAction, EMPTY);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const requirements = {
    ...checkPassword(password),
    match: password.length > 0 && password === passwordConfirm,
  };

  const filled =
    username.trim().length >= 3 &&
    EMAIL_PATTERN.test(email.trim()) &&
    Object.values(requirements).every(Boolean);

  return (
    <Card>
      <form action={action} className="grid gap-4">
        <input type="hidden" name="proximo" value={next ?? "/"} />
        <FloatingInput
          label="Nome de usuário"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={state.fieldErrors?.username}
          disabled={pending}
          required
        />

        <FloatingInput
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={state.fieldErrors?.email}
          disabled={pending}
          required
        />

        <FloatingInput
          label="Senha"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          revealed={showPassword}
          onRevealedChange={setShowPassword}
          error={state.fieldErrors?.password}
          disabled={pending}
          required
        />

        <FloatingInput
          label="Repita a senha"
          name="passwordConfirm"
          type={showPassword ? "text" : "password"}
          showToggle={false}
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          error={state.fieldErrors?.passwordConfirm}
          disabled={pending}
          required
        />

        <ul className="grid gap-1.5" aria-label="Requisitos da senha">
          <PasswordRequirement ok={requirements.length} text="Ao menos 8 caracteres" />
          <PasswordRequirement ok={requirements.numberOrSymbol} text="Deve conter um número ou símbolo" />
          <PasswordRequirement ok={requirements.uppercase} text="Deve conter ao menos uma letra maiúscula" />
          <PasswordRequirement ok={requirements.match} text="As senhas devem coincidir" />
        </ul>

        {state.message ? (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{state.message}</p>
        ) : null}

        <Button type="submit" size="lg" disabled={pending || !filled} className={AUTH_SUBMIT}>
          {pending ? "Criando..." : "Criar conta"}
        </Button>
      </form>
    </Card>
  );
}
