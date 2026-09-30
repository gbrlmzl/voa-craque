import { createTransport, type Transporter } from "nodemailer";

export type MailMessage = { to: string; subject: string; text: string; html: string };

// Guardado no globalThis, mesmo padrao do rate-limit.ts: sobrevive ao hot-reload
// e e o mesmo transporte entre os bundles de rota que importam este modulo.
const TRANSPORT_KEY = Symbol.for("voacraque.mailer");
const globalStore = globalThis as unknown as { [TRANSPORT_KEY]?: Transporter };

function driver(): "console" | "smtp" {
  return process.env.MAIL_DRIVER === "smtp" ? "smtp" : "console";
}

function transporter(): Transporter {
  if (!globalStore[TRANSPORT_KEY]) {
    globalStore[TRANSPORT_KEY] = createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    });
  }
  return globalStore[TRANSPORT_KEY];
}

/**
 * Ponto unico de envio. O driver `console` existe para desenvolvimento sem SMTP:
 * fora de producao imprime a mensagem inteira (inclusive o link de redefinicao)
 * no log do servidor; em producao nunca imprime o conteudo, porque o link daria
 * acesso a conta a quem le o log — so avisa que o e-mail nao foi enviado.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  try {
    if (driver() === "console") {
      if (process.env.NODE_ENV === "production") {
        console.error(`[mail] driver "console" em producao: e-mail para ${message.to} nao foi enviado`);
        return;
      }
      console.info(`[mail] para=${message.to} assunto="${message.subject}"\n${message.text}`);
      return;
    }

    await transporter().sendMail({ from: process.env.MAIL_FROM, to: message.to, subject: message.subject, text: message.text, html: message.html });
  } catch (error) {
    console.error(`[mail] falha ao enviar para ${message.to}`, error);
    throw error;
  }
}
