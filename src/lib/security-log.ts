export type SecurityEvent =
  /** Roubo confirmado: um token de sessao ja rotacionado voltou fora da janela de graca. */
  | "session_token_reuse"
  /** Concorrencia normal (abas, prefetch). Nao alerta; volume anormal denuncia bug de renovacao. */
  | "session_token_grace_reuse"
  | "login_failed"
  | "rate_limit_exceeded"
  | "google_login_denied"
  | "google_account_linked"
  | "password_changed"
  /** `reason`: invalid_current_password */
  | "password_change_failed"
  /** `reason` quando nao envia: user_not_found, no_local_password, inactive, email_rate_limited */
  | "password_reset_requested"
  | "password_reset_completed"
  /** `reason`: unknown, used, expired, inactive, no_local_password */
  | "password_reset_rejected";

/**
 * Uma linha, um objeto JSON, chaves estaveis: e isso que permite pendurar um
 * filtro de metrica e um alarme em cima (ex.: { $.event = "session_token_reuse" }).
 * Nunca registre senha nem token; so identificadores, prefixo de hash e IP.
 */
export function logSecurityEvent(event: SecurityEvent, fields: Record<string, unknown> = {}): void {
  console.warn(JSON.stringify({ type: "security", event, at: new Date().toISOString(), ...fields }));
}
