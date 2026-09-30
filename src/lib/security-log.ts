export type SecurityEvent =
  /** Roubo confirmado: um refresh ja rotacionado voltou fora da janela de graca. A familia inteira cai. */
  | "refresh_token_reuse"
  /** Concorrencia normal (abas, fetch em paralelo). Nao alerta; volume anormal denuncia bug de renovacao. */
  | "refresh_token_grace_reuse"
  /**
   * Refresh revogado por logout, troca/redefinicao de senha, vinculo do Google ou
   * reuso ja detectado voltou a aparecer. `reason` = motivo da revogacao. Nao e
   * alarme: o caso comum e um aparelho que ficou com o token antigo.
   */
  | "refresh_token_revoked_use"
  | "login_failed"
  | "rate_limit_exceeded"
  /** `reason`: email_not_verified, inactive, state_mismatch, invalid_id_token */
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
 * filtro de metrica e um alarme em cima (ex.: { $.event = "refresh_token_reuse" }).
 * Nunca registre senha nem token; so identificadores, prefixo de hash e IP.
 */
export function logSecurityEvent(event: SecurityEvent, fields: Record<string, unknown> = {}): void {
  console.warn(JSON.stringify({ type: "security", event, at: new Date().toISOString(), ...fields }));
}
