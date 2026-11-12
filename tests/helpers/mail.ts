import { mailbox } from "./next-env";

export { mailbox };

/** Link de redefinicao do ultimo e-mail enviado (o token vai no query string). */
export function lastResetLink(): string | null {
  const last = mailbox[mailbox.length - 1];
  return last?.text.match(/https?:\/\/\S*reset-password\S*/)?.[0] ?? null;
}
