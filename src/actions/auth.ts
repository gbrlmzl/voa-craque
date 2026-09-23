"use server";

import { headers } from "next/headers";
import { AuthError, CredentialsSignin } from "next-auth";
import { hash } from "bcryptjs";
import type { ZodError } from "zod";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { credentialsSchema, registerSchema } from "@/lib/validation";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { isGoogleAuthEnabled } from "@/lib/auth/config";
import { safeNextPath } from "@/lib/auth/routes";
import { clientIp } from "@/lib/client-ip";
import { formatRetry, registerLimiter } from "@/lib/rate-limit";

export type FormState = { message?: string; fieldErrors?: Record<string, string> };

function fieldErrorsOf(error: ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

/**
 * Server Action, e nao fetch do cliente: o Auth.js grava o cookie com
 * cookies().set dentro da action, e um cookie alterado numa action faz o Next
 * rerenderizar a arvore inteira na mesma resposta. O layout raiz cria uma
 * promise de sessao nova e o UserProvider ja recebe o usuario logado, sem
 * router.refresh().
 */
export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentialsSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    await signIn("credentials", { ...parsed.data, redirectTo: safeNextPath(formData.get("proximo")) });
  } catch (error) {
    if (error instanceof CredentialsSignin && error.code === "rate_limited") {
      return { message: "Muitas tentativas de login. Espere alguns minutos e tente de novo." };
    }
    // A mesma mensagem para usuario inexistente e senha errada: nao revela quem tem conta.
    if (error instanceof AuthError) return { message: "Usuário ou senha não conferem." };
    throw error;
  }
  return {};
}

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ip = clientIp(await headers());
  const wait = registerLimiter.retryAfter(ip);
  if (wait > 0) {
    return { message: `Muitos cadastros a partir desta rede. Tente de novo em ${formatRetry(wait)}.` };
  }

  const parsed = registerSchema.safeParse({
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  // Conta toda tentativa valida, inclusive as que dao certo (ver registerLimiter).
  registerLimiter.hit(ip);

  const { username, email, password } = parsed.data;

  const existingEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingEmail) {
    return { fieldErrors: { email: "Já existe uma conta com este e-mail." } };
  }

  const existingUsername = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (existingUsername) {
    return { fieldErrors: { username: "Este nome de usuário já está em uso." } };
  }

  const user = await prisma.user.create({
    data: { username, email, passwordHash: await hash(password, 10) },
  });

  await recordAudit(user, {
    action: AUDIT_ACTIONS.USER_CREATED,
    entity: "User",
    entityId: user.id,
    summary: `${user.username} criou a conta`,
    after: { username: user.username, email: user.email, role: user.role },
  });

  try {
    await signIn("credentials", { username, password, redirectTo: "/onboarding" });
  } catch (error) {
    if (error instanceof AuthError) {
      return { message: "Conta criada. Entre com seu usuário e senha." };
    }
    throw error;
  }
  return {};
}

/** Leva ao Google; a volta cai em /api/auth/callback/google e de la no destino. */
export async function googleSignInAction(formData: FormData): Promise<void> {
  if (!isGoogleAuthEnabled()) return;
  await signIn("google", { redirectTo: safeNextPath(formData.get("proximo")) });
}

/** Revoga a familia de tokens deste dispositivo (events.signOut em src/auth.ts) e limpa o cookie. */
export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
