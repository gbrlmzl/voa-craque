"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { credentialsSchema, registerSchema } from "@/lib/validation";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { isGoogleAuthEnabled } from "@/lib/auth/config";
import { verifyCredentials } from "@/lib/auth/credentials";
import { endSession, establishSession } from "@/lib/auth/establish-session";
import { startGoogleSignIn } from "@/lib/auth/google-oauth";
import { hashPassword } from "@/lib/auth/password";
import { safeNextPath } from "@/lib/auth/routes";
import { clientIp } from "@/lib/client-ip";
import { fieldErrorsOf } from "@/lib/form-state";
import { formatRetry, loginLimiter, registerLimiter } from "@/lib/rate-limit";

export type FormState = { message?: string; fieldErrors?: Record<string, string>; ok?: boolean };

/**
 * Server Action, e nao fetch do cliente: o cookie e gravado com cookies().set
 * dentro da action, e um cookie alterado numa action faz o Next rerenderizar a
 * arvore inteira na mesma resposta. O layout raiz cria uma promise de sessao nova
 * e o UserProvider ja recebe o usuario logado, sem router.refresh().
 *
 * O limite de tentativas mora aqui: nao existe outro endpoint de login. Nunca
 * ponha `redirect()` dentro de try/catch (ele lanca de proposito).
 */
export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentialsSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const ip = clientIp(await headers());
  if (loginLimiter.retryAfter(ip) > 0) {
    return { message: "Muitas tentativas de login. Espere alguns minutos e tente de novo." };
  }

  const user = await verifyCredentials(parsed.data.username, parsed.data.password, ip);
  if (!user) {
    loginLimiter.hit(ip);
    // A mesma mensagem para usuario inexistente e senha errada: nao revela quem tem conta.
    return { message: "Usuário ou senha não conferem." };
  }

  await establishSession(user.id);
  redirect(safeNextPath(formData.get("proximo")));
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
    data: { username, email, passwordHash: await hashPassword(password) },
  });

  await recordAudit(user, {
    action: AUDIT_ACTIONS.USER_CREATED,
    entity: "User",
    entityId: user.id,
    summary: `${user.username} criou a conta`,
    after: { username: user.username, email: user.email, role: user.role },
  });

  await establishSession(user.id);
  redirect("/onboarding");
}

/**
 * Leva ao Google; a volta cai em /api/auth/callback/google (route handler) e de
 * la no destino. Grava o cookie de state antes de redirecionar.
 */
export async function googleSignInAction(formData: FormData): Promise<void> {
  if (!isGoogleAuthEnabled()) return;
  const url = await startGoogleSignIn(safeNextPath(formData.get("proximo")));
  redirect(url.toString());
}

/** Revoga a familia de refresh deste aparelho e apaga os dois cookies (ver endSession). */
export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}
