/**
 * Como o usuario ve o nome dos times: "Time A" ou "Time 1". So muda a exibicao;
 * no banco e nas APIs o time continua se chamando A, B, C... e e a letra gravada
 * que escolhe a cor (teamColor).
 */
export type TeamLabelMode = "letters" | "numbers";

export const TEAM_LABEL_COOKIE = "vc_team_label";
export const DEFAULT_TEAM_LABEL_MODE: TeamLabelMode = "letters";

/** Valor de cookie desconhecido ou adulterado cai no padrao. */
export function parseTeamLabelMode(value: string | undefined | null): TeamLabelMode {
  return value === "numbers" ? "numbers" : DEFAULT_TEAM_LABEL_MODE;
}

/**
 * "A" -> "A" ou "1". So converte uma letra maiuscula (posicao no alfabeto);
 * qualquer outro nome (como o "?" de time desconhecido) volta sem conversao.
 */
export function formatTeamTag(name: string, mode: TeamLabelMode): string {
  if (mode === "numbers" && /^[A-Z]$/.test(name)) return String(name.charCodeAt(0) - 64);
  return name;
}

/** "A" -> "Time A" ou "Time 1". */
export function formatTeamName(name: string, mode: TeamLabelMode): string {
  return `Time ${formatTeamTag(name, mode)}`;
}
