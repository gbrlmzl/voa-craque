"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { compare } from "bcryptjs";
import type { FormState } from "@/actions/auth";
import { prisma } from "@/lib/prisma";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { SESSION_COOKIE_NAME } from "@/lib/auth/config";
import { hashPassword } from "@/lib/auth/password";
import {
  buildPasswordResetUrl,
  hashResetToken,
  issuePasswordResetToken,
  resetPasswordWithToken,
} from "@/lib/auth/password-reset";
import { readSessionCookie } from "@/lib/auth/session-cookie";
import { revokeOtherSessionFamilies } from "@/lib/auth/session-store";
import { clientIp } from "@/lib/client-ip";
import { fieldErrorsOf } from "@/lib/form-state";
import { sendMail } from "@/lib/mail/mailer";
import { passwordChangedEmail, passwordResetEmail } from "@/lib/mail/templates";
import {
  changePasswordLimiter,
  forgotPasswordEmailLimiter,
  forgotPasswordLimiter,
  formatRetry,
  resetPasswordLimiter,
} from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security-log";
import { getCurrentUser } from "@/lib/session";
import { changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } from "@/lib/validation";

const GENERIC_RESET_MESSAGE =
  "Se existir uma conta com esse e-mail, enviamos um link para criar uma senha nova. Ele vale por 30 minutos.";

function formatWhen(date: Date): string {
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Falha de envio do aviso nunca derruba o fluxo principal; so vai para o log, sem o conteudo. */
async function sendChangeNotice(to: string, username: string, when: Date): Promise<void> {
  try {
    await sendMail({ to, ...passwordChangedEmail({ username, when: formatWhen(when) }) });
  } catch (error) {
    console.error("[password] falha ao enviar aviso de senha alterada", error);
  }
}

/**
 * Troca de senha logado. Exige a senha atual, revoga as sessoes de todos os
 * OUTROS aparelhos (a familia do dispositivo atual continua, sem reescrever o
 * cookie nem brigar com a rotacao do proxy) e invalida links de redefinicao
 * pendentes: uma senha nova torna qualquer link antigo desnecessario.
 */
export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.hasPassword) {
    return { message: "Esta conta entra pelo Google e não tem senha local." };
  }

  const wait = changePasswordLimiter.retryAfter(user.id);
  if (wait > 0) {
    return { message: `Muitas tentativas. Espere ${formatRetry(wait)} e tente de novo.` };
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    newPasswordConfirm: formData.get("newPasswordConfirm"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  // Nao confia no CurrentUser (vem do cookie/cache): busca o hash fresco no banco.
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row?.passwordHash || !(await compare(parsed.data.currentPassword, row.passwordHash))) {
    changePasswordLimiter.hit(user.id);
    logSecurityEvent("password_change_failed", { userId: user.id, reason: "invalid_current_password" });
    return { fieldErrors: { currentPassword: "Senha atual incorreta." } };
  }

  if (await compare(parsed.data.newPassword, row.passwordHash)) {
    return { fieldErrors: { newPassword: "A senha nova precisa ser diferente da atual." } };
  }

  const claims = await readSessionCookie((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!claims) redirect("/login");

  const now = new Date();
  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } }),
  ]);
  await revokeOtherSessionFamilies(user.id, claims.sid);

  changePasswordLimiter.reset(user.id);
  logSecurityEvent("password_changed", { userId: user.id });
  await recordAudit(user, {
    action: AUDIT_ACTIONS.PASSWORD_CHANGED,
    entity: "User",
    entityId: user.id,
    summary: `${user.username} alterou a senha`,
  });

  after(() => sendChangeNotice(user.email, user.username, now));

  return { ok: true, message: "Senha alterada. As sessões abertas em outros aparelhos foram encerradas." };
}

/**
 * Pedido de link de redefinicao. Toda a parte que revelaria se a conta existe
 * (consulta, limitador por e-mail, emissao do token, envio) roda em `after()`,
 * depois da resposta ja ter saido: assim a resposta leva o mesmo tempo com ou
 * sem conta, e um SMTP lento nao denuncia nada por diferenca de latencia.
 */
export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ip = clientIp(await headers());
  const wait = forgotPasswordLimiter.retryAfter(ip);
  if (wait > 0) {
    return { message: `Muitas tentativas. Espere ${formatRetry(wait)} e tente de novo.` };
  }
  forgotPasswordLimiter.hit(ip);

  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const { email } = parsed.data;

  after(async () => {
    try {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, username: true, email: true, active: true, passwordHash: true },
      });

      if (!user) {
        logSecurityEvent("password_reset_requested", { reason: "user_not_found", ip });
        return;
      }
      if (!user.active) {
        logSecurityEvent("password_reset_requested", { userId: user.id, reason: "inactive", ip });
        return;
      }
      if (!user.passwordHash) {
        logSecurityEvent("password_reset_requested", { userId: user.id, reason: "no_local_password", ip });
        return;
      }

      // Por e-mail, nao por IP: nao deixa encher a caixa de outra pessoa usando IPs diferentes.
      if (forgotPasswordEmailLimiter.retryAfter(user.email) > 0) {
        logSecurityEvent("password_reset_requested", { userId: user.id, reason: "email_rate_limited", ip });
        return;
      }
      forgotPasswordEmailLimiter.hit(user.email);

      const raw = await issuePasswordResetToken(user.id);
      const url = buildPasswordResetUrl(raw);
      await sendMail({
        to: user.email,
        ...passwordResetEmail({ username: user.username, url: url.toString(), ttlMinutes: 30 }),
      });
      logSecurityEvent("password_reset_requested", { userId: user.id, ip });
    } catch (error) {
      console.error("[password] falha ao processar pedido de redefinicao de senha", error);
    }
  });

  return { ok: true, message: GENERIC_RESET_MESSAGE };
}

/** Redefine a senha a partir do link recebido por e-mail; consome o token. */
export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ip = clientIp(await headers());
  const wait = resetPasswordLimiter.retryAfter(ip);
  if (wait > 0) {
    return { message: `Muitas tentativas. Espere ${formatRetry(wait)} e tente de novo.` };
  }
  resetPasswordLimiter.hit(ip);

  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const result = await resetPasswordWithToken(parsed.data.token, parsed.data.password);
  if (!result.ok) {
    logSecurityEvent("password_reset_rejected", {
      reason: result.reason,
      tokenHashPrefix: hashResetToken(parsed.data.token).slice(0, 12),
    });
    // Uma so mensagem para os quatro motivos: nao diz qual deles se aplica.
    return { message: "Este link é inválido ou expirou. Peça um novo." };
  }

  const now = new Date();
  logSecurityEvent("password_reset_completed", { userId: result.user.id });
  await recordAudit(result.user, {
    action: AUDIT_ACTIONS.PASSWORD_RESET,
    entity: "User",
    entityId: result.user.id,
    summary: `${result.user.username} redefiniu a senha por e-mail`,
  });

  after(() => sendChangeNotice(result.user.email, result.user.username, now));

  redirect("/login?senha=redefinida");
}
