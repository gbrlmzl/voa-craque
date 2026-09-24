/**
 * Constantes de auditoria, sem nenhuma dependencia de servidor: a tabela de
 * consulta e um componente de cliente e precisa dos rotulos.
 */

export const AUDIT_ACTIONS = {
  USER_CREATED: "USER_CREATED",
  USER_UPDATED: "USER_UPDATED",
  USER_ROLE_CHANGED: "USER_ROLE_CHANGED",
  PROFILE_COMPLETED: "PROFILE_COMPLETED",
  PROFILE_UPDATED: "PROFILE_UPDATED",
  PLAYER_STARS_SET: "PLAYER_STARS_SET",
  GAMEDAY_CREATED: "GAMEDAY_CREATED",
  GAMEDAY_UPDATED: "GAMEDAY_UPDATED",
  GAMEDAY_FINISHED: "GAMEDAY_FINISHED",
  REGISTRATION_CREATED: "REGISTRATION_CREATED",
  REGISTRATION_CANCELLED: "REGISTRATION_CANCELLED",
  PAYMENT_CONFIRMED: "PAYMENT_CONFIRMED",
  PAYMENT_REJECTED: "PAYMENT_REJECTED",
  PAYMENT_RESET: "PAYMENT_RESET",
  TEAMS_DRAWN: "TEAMS_DRAWN",
  TEAMS_SET_MANUALLY: "TEAMS_SET_MANUALLY",
  MATCH_CREATED: "MATCH_CREATED",
  MATCH_STARTED: "MATCH_STARTED",
  MATCH_PAUSED: "MATCH_PAUSED",
  MATCH_RESUMED: "MATCH_RESUMED",
  MATCH_FINISHED: "MATCH_FINISHED",
  MATCH_EVENT_CREATED: "MATCH_EVENT_CREATED",
  MATCH_EVENT_UNDONE: "MATCH_EVENT_UNDONE",
  SYSTEM_SETTINGS_UPDATED: "SYSTEM_SETTINGS_UPDATED",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  USER_CREATED: "Conta criada",
  USER_UPDATED: "Dados do usuário alterados",
  USER_ROLE_CHANGED: "Papel alterado",
  PROFILE_COMPLETED: "Perfil preenchido",
  PROFILE_UPDATED: "Perfil atualizado",
  PLAYER_STARS_SET: "Estrelas definidas",
  GAMEDAY_CREATED: "Pelada criada",
  GAMEDAY_UPDATED: "Pelada editada",
  GAMEDAY_FINISHED: "Pelada encerrada",
  REGISTRATION_CREATED: "Inscrição feita",
  REGISTRATION_CANCELLED: "Inscrição cancelada",
  PAYMENT_CONFIRMED: "Pagamento confirmado",
  PAYMENT_REJECTED: "Pagamento recusado",
  PAYMENT_RESET: "Pagamento voltou para pendente",
  TEAMS_DRAWN: "Times sorteados",
  TEAMS_SET_MANUALLY: "Times montados na mão",
  MATCH_CREATED: "Partida criada",
  MATCH_STARTED: "Partida iniciada",
  MATCH_PAUSED: "Partida pausada",
  MATCH_RESUMED: "Partida retomada",
  MATCH_FINISHED: "Partida encerrada",
  MATCH_EVENT_CREATED: "Evento registrado",
  MATCH_EVENT_UNDONE: "Evento desfeito",
  SYSTEM_SETTINGS_UPDATED: "Configuração do sistema alterada",
};

export const AUDIT_ENTITIES = [
  "User",
  "PlayerProfile",
  "GameDay",
  "Registration",
  "Team",
  "Match",
  "MatchEvent",
  "SystemSetting",
] as const;

export type AuditEntity = (typeof AUDIT_ENTITIES)[number];
