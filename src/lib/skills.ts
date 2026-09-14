export type SkillSeed = {
  code: string;
  label: string;
  polarity: "POSITIVE" | "NEGATIVE";
  hint: string;
};

/**
 * Lista fixa combinada pelo grupo. Só o organizador atribui skills;
 * o jogador não edita as próprias.
 */
export const SKILL_CATALOG: SkillSeed[] = [
  { code: "tita", label: "Titã", polarity: "POSITIVE", hint: "Segura a quadra sozinho" },
  { code: "brocador", label: "Brocador", polarity: "POSITIVE", hint: "Chega chegando, decide no drible" },
  { code: "garcom", label: "Garçom", polarity: "POSITIVE", hint: "Serve o gol na bandeja" },
  { code: "racudo", label: "Raçudo", polarity: "POSITIVE", hint: "Corre os 40 minutos" },
  { code: "diferenciado", label: "Diferenciado", polarity: "POSITIVE", hint: "Faz o que ninguém mais faz" },
  { code: "ensaboado", label: "Ensaboado", polarity: "NEGATIVE", hint: "A bola escapa sozinha" },
  { code: "ele-se-esforca", label: "Ele se esforça", polarity: "NEGATIVE", hint: "Vontade tem, o resto nem tanto" },
  { code: "nao-marca", label: "Não marca", polarity: "NEGATIVE", hint: "Só volta para comemorar" },
  { code: "piter", label: "Piter", polarity: "NEGATIVE", hint: "Some da partida" },
  { code: "acougueiro", label: "Açougueiro", polarity: "NEGATIVE", hint: "Entra para machucar" },
];

export const SKILL_HINTS: Record<string, string> = Object.fromEntries(
  SKILL_CATALOG.map((skill) => [skill.code, skill.hint]),
);
