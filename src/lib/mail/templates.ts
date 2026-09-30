function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrap(title: string, bodyHtml: string): string {
  return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
  <h1 style="font-size:18px">${title}</h1>
  ${bodyHtml}
  <p style="margin-top:24px;font-size:12px;color:#64748b">Voa Craque</p>
</div>`;
}

export type MailTemplate = { subject: string; text: string; html: string };

/** Nunca inclui a senha: so o link, que ela usa para escolher uma nova. */
export function passwordResetEmail({
  username,
  url,
  ttlMinutes,
}: {
  username: string;
  url: string;
  ttlMinutes: number;
}): MailTemplate {
  const subject = "Redefinir sua senha no Voa Craque";
  const text = [
    `Oi, ${username}.`,
    "",
    `Recebemos um pedido para criar uma senha nova para sua conta. Este link vale por ${ttlMinutes} minutos e funciona uma única vez:`,
    url,
    "",
    "Se você não pediu isso, pode ignorar este e-mail: sua senha continua a mesma.",
  ].join("\n");
  const html = wrap(subject, `
  <p>Oi, ${escapeHtml(username)}.</p>
  <p>Recebemos um pedido para criar uma senha nova para sua conta. Este link vale por ${ttlMinutes} minutos e funciona uma única vez:</p>
  <p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>
  <p>Se você não pediu isso, pode ignorar este e-mail: sua senha continua a mesma.</p>
`);
  return { subject, text, html };
}

/** Aviso enviado depois de toda troca ou redefinicao de senha. */
export function passwordChangedEmail({ username, when }: { username: string; when: string }): MailTemplate {
  const subject = "Sua senha foi alterada";
  const text = [
    `Oi, ${username}.`,
    "",
    `Sua senha foi alterada em ${when}.`,
    "",
    "Se não foi você, use a opção \"Esqueci minha senha\" na tela de login para recuperar o acesso à sua conta.",
  ].join("\n");
  const html = wrap(subject, `
  <p>Oi, ${escapeHtml(username)}.</p>
  <p>Sua senha foi alterada em ${escapeHtml(when)}.</p>
  <p>Se não foi você, use a opção "Esqueci minha senha" na tela de login para recuperar o acesso à sua conta.</p>
`);
  return { subject, text, html };
}
