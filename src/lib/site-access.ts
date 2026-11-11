export type AccessSettings = { publicAccessEnabled: boolean; privateSiteEnabled: boolean };
export type Viewer = { role: "USER" | "ADMIN" | "SUPERADMIN" } | null;

export type AccessDecision = "allow" | "login" | "maintenance";

/**
 * Quem entra no site, dadas as chaves de /admin/system. Manutencao vence a chave
 * de site privado, e o superadmin sempre entra (continua trabalhando em manutencao).
 */
export function decideAccess(viewer: Viewer, settings: AccessSettings): AccessDecision {
  if (viewer?.role === "SUPERADMIN") return "allow";
  if (!settings.publicAccessEnabled) return "maintenance";
  if (viewer) return "allow";
  if (!settings.privateSiteEnabled) return "allow";
  return "login";
}

export type SettingsSnapshot = AccessSettings & { registrationOpen: boolean };

/**
 * Resumo do que mudou numa gravacao de /admin/system, para a auditoria. Compara
 * so as tres chaves; a mensagem de manutencao fica de fora porque e texto livre.
 */
export function settingsChangeSummary(before: SettingsSnapshot | null, after: SettingsSnapshot): string {
  const changes: string[] = [];
  const flipped = (key: keyof SettingsSnapshot) => before !== null && before[key] !== after[key];

  if (flipped("publicAccessEnabled")) changes.push(after.publicAccessEnabled ? "Site liberado" : "Site em manutenção");
  if (flipped("privateSiteEnabled")) changes.push(after.privateSiteEnabled ? "Site privado ligado" : "Site privado desligado");
  if (flipped("registrationOpen")) changes.push(after.registrationOpen ? "Inscrições abertas" : "Inscrições fechadas");

  return changes.length > 0 ? changes.join(" · ") : "Configuração salva sem alterações";
}
