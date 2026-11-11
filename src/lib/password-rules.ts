/**
 * Regras de senha nova. Uma fonte so: o schema do servidor (validation.ts) e
 * a lista de criterios da tela de cadastro importam daqui, entao nunca divergem.
 * Vale para senha criada ou trocada; quem ja tem conta com senha antiga entra normalmente.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

export const PASSWORD_HINT = "Mínimo de 8 caracteres, com uma letra maiúscula e um número ou símbolo.";

export const PASSWORD_MESSAGES = {
  length: `A senha precisa de pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  uppercase: "A senha precisa de ao menos uma letra maiúscula.",
  numberOrSymbol: "A senha precisa de um número ou símbolo.",
} as const;

export function checkPassword(password: string) {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH,
    uppercase: /[A-Z]/.test(password),
    numberOrSymbol: /[\d\W]/.test(password),
  };
}
