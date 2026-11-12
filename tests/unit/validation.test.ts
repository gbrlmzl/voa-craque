import {
  adminRegistrationSchema,
  auditQuerySchema,
  changePasswordSchema,
  credentialsSchema,
  drawSchema,
  forgotPasswordSchema,
  gameDaySchema,
  manualTeamsSchema,
  matchActionSchema,
  matchEventSchema,
  mmrAdjustSchema,
  paymentDecisionSchema,
  profileSchema,
  registerSchema,
  registrationSchema,
  resetPasswordSchema,
  roleSchema,
  starsSchema,
  substitutionSchema,
  systemSettingsSchema,
} from "../../src/lib/validation";
import { PASSWORD_MESSAGES } from "../../src/lib/password-rules";

// Mesma regra de fieldErrorsOf (src/lib/form-state.ts): vale a primeira mensagem de cada campo.
const errorsOf = (result: { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } }) => {
  const errors: Record<string, string> = {};
  for (const issue of result.error?.issues ?? []) errors[issue.path.join(".")] ??= issue.message;
  return errors;
};

const gameDay = {
  title: "Pelada de sexta",
  scheduledAt: "2030-05-10T20:00:00-03:00",
  location: "Quadra do Bairro",
  pricePerPlayerCents: 1200,
  matchDurationSec: 600,
  goalsToWin: 2,
  maxPlayers: 20,
  teamSize: 4,
  pixKey: "pix@voacraque.app",
};

describe("credentialsSchema", () => {
  it("normaliza o usuario (trim + minusculas) e mantem a senha como veio", () => {
    expect(credentialsSchema.parse({ username: "  GabRiel ", password: " Segredo " })).toEqual({
      username: "gabriel",
      password: " Segredo ",
    });
  });
  it("campos obrigatorios, com mensagem em portugues", () => {
    expect(errorsOf(credentialsSchema.safeParse({ username: "  ", password: "" }))).toEqual({
      username: "Informe o usuário.",
      password: "Informe a senha.",
    });
  });
});

describe("registerSchema", () => {
  const valid = { username: "Novo.Jogador_1", email: " Novo@Teste.COM ", password: "Senha@123", passwordConfirm: "Senha@123" };

  it("valido: username e e-mail em minusculas", () => {
    expect(registerSchema.parse(valid)).toMatchObject({ username: "novo.jogador_1", email: "novo@teste.com" });
  });
  it.each([
    ["ab", "Minimo de 3 caracteres."],
    ["a".repeat(25), "Maximo de 24 caracteres."],
    ["com espaco", "Use letras, numeros, ponto ou underscore."],
    ["acentuação", "Use letras, numeros, ponto ou underscore."],
  ])("username %j", (username, message) => {
    expect(errorsOf(registerSchema.safeParse({ ...valid, username })).username).toBe(message);
  });
  it("e-mail invalido ou vazio", () => {
    expect(errorsOf(registerSchema.safeParse({ ...valid, email: "x" })).email).toBe("E-mail invalido.");
    expect(errorsOf(registerSchema.safeParse({ ...valid, email: "" })).email).toBe("Informe o e-mail.");
  });
  it("regras da senha nova", () => {
    expect(errorsOf(registerSchema.safeParse({ ...valid, password: "Ab@1", passwordConfirm: "Ab@1" })).password).toBe(PASSWORD_MESSAGES.length);
    expect(errorsOf(registerSchema.safeParse({ ...valid, password: "senha@123", passwordConfirm: "senha@123" })).password).toBe(PASSWORD_MESSAGES.uppercase);
    expect(errorsOf(registerSchema.safeParse({ ...valid, password: "SenhaSenha", passwordConfirm: "SenhaSenha" })).password).toBe(PASSWORD_MESSAGES.numberOrSymbol);
    expect(registerSchema.safeParse({ ...valid, password: "x".repeat(73), passwordConfirm: "x".repeat(73) }).success).toBe(false);
  });
  it("confirmacao diferente cai no campo da confirmacao", () => {
    expect(errorsOf(registerSchema.safeParse({ ...valid, passwordConfirm: "Outra@123" })).passwordConfirm).toBe("As senhas nao conferem.");
  });
});

describe("senhas: troca e redefinicao", () => {
  it("changePasswordSchema exige a atual e a nova valida e igual a confirmacao", () => {
    expect(changePasswordSchema.safeParse({ currentPassword: "x", newPassword: "Nova@123", newPasswordConfirm: "Nova@123" }).success).toBe(true);
    expect(errorsOf(changePasswordSchema.safeParse({ currentPassword: "", newPassword: "fraca", newPasswordConfirm: "x" }))).toMatchObject({
      currentPassword: "Informe a senha atual.",
      newPassword: PASSWORD_MESSAGES.length,
    });
    expect(errorsOf(changePasswordSchema.safeParse({ currentPassword: "x", newPassword: "Nova@123", newPasswordConfirm: "Outra@123" })).newPasswordConfirm).toBe("As senhas nao conferem.");
  });
  it("forgotPasswordSchema normaliza o e-mail", () => {
    expect(forgotPasswordSchema.parse({ email: "  A@B.com " })).toEqual({ email: "a@b.com" });
  });
  it("resetPasswordSchema: token de 20 a 200 caracteres", () => {
    const base = { password: "Nova@123", passwordConfirm: "Nova@123" };
    expect(resetPasswordSchema.safeParse({ ...base, token: "t".repeat(19) }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ ...base, token: "t".repeat(43) }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ ...base, token: "t".repeat(201) }).success).toBe(false);
  });
});

describe("profileSchema", () => {
  const valid = { name: "Gabriel", foot: "LEFT", position: "ALA", age: 28, heightCm: 178, weightKg: 74 };

  it("valido minimo; numeros em texto (formulario) sao coagidos", () => {
    expect(profileSchema.parse({ ...valid, age: "28", heightCm: "178", weightKg: "74" })).toMatchObject({ age: 28, heightCm: 178, weightKg: 74 });
  });
  it("limites e mensagens", () => {
    expect(errorsOf(profileSchema.safeParse({ ...valid, name: "A", foot: "X", position: "Y", age: 13, heightCm: 129, weightKg: 34 }))).toEqual({
      name: "Informe seu nome.",
      foot: "Escolha o pe que voce chuta.",
      position: "Escolha sua posicao.",
      age: "Idade minima 14 anos.",
      heightCm: "Altura em centimetros.",
      weightKg: "Peso em quilos.",
    });
    expect(profileSchema.safeParse({ ...valid, age: 71 }).success).toBe(false);
    expect(profileSchema.safeParse({ ...valid, age: 20.5 }).success).toBe(false);
  });
  it("apelido e foto sao opcionais e aceitam vazio", () => {
    expect(profileSchema.safeParse({ ...valid, nickname: "", photoUrl: "" }).success).toBe(true);
    expect(profileSchema.safeParse({ ...valid, nickname: "x".repeat(31) }).success).toBe(false);
  });
});

describe("gameDaySchema", () => {
  it("valido minimo; data em texto vira Date; numeros em texto sao coagidos", () => {
    const parsed = gameDaySchema.parse({ ...gameDay, pricePerPlayerCents: "1200" });
    expect(parsed.scheduledAt).toBeInstanceOf(Date);
    expect(parsed.pricePerPlayerCents).toBe(1200);
  });
  it("cada campo obrigatorio", () => {
    for (const key of ["title", "scheduledAt", "location", "pixKey"] as const) {
      const { [key]: _omit, ...rest } = gameDay;
      void _omit;
      expect(errorsOf(gameDaySchema.safeParse(rest))).toHaveProperty(key);
    }
  });
  it("limites (vagas, preco, duracao, gols, tamanho do time)", () => {
    expect(gameDaySchema.safeParse({ ...gameDay, maxPlayers: 9 }).success).toBe(false);
    expect(gameDaySchema.safeParse({ ...gameDay, maxPlayers: 51 }).success).toBe(false);
    expect(gameDaySchema.safeParse({ ...gameDay, pricePerPlayerCents: -1 }).success).toBe(false);
    expect(gameDaySchema.safeParse({ ...gameDay, pricePerPlayerCents: 100001 }).success).toBe(false);
    expect(gameDaySchema.safeParse({ ...gameDay, pricePerPlayerCents: 0 }).success).toBe(true);
    expect(errorsOf(gameDaySchema.safeParse({ ...gameDay, matchDurationSec: 59 })).matchDurationSec).toBe("Minimo de 1 minuto.");
    expect(gameDaySchema.safeParse({ ...gameDay, matchDurationSec: 3601 }).success).toBe(false);
    expect(gameDaySchema.safeParse({ ...gameDay, goalsToWin: 0 }).success).toBe(false);
    expect(gameDaySchema.safeParse({ ...gameDay, teamSize: 2 }).success).toBe(false);
    expect(gameDaySchema.safeParse({ ...gameDay, teamSize: 8 }).success).toBe(false);
  });
  it("mensagens", () => {
    expect(errorsOf(gameDaySchema.safeParse({ ...gameDay, title: "ab", location: "x", pixKey: "  ", scheduledAt: "ontem" }))).toEqual({
      title: "De um nome para a pelada.",
      location: "Informe o local.",
      pixKey: "Informe a chave PIX.",
      // A mensagem passada a z.coerce.date() so vale para tipo errado; texto que nao e data
      // sai com a mensagem padrao do zod, em ingles (anotado no relatorio).
      scheduledAt: "Invalid date",
    });
  });
});

describe("inscricoes e pagamento", () => {
  it("registrationSchema", () => {
    expect(registrationSchema.parse({ paymentMethod: "ON_SITE" })).toEqual({ paymentMethod: "ON_SITE" });
    expect(errorsOf(registrationSchema.safeParse({ paymentMethod: "CARTAO" })).paymentMethod).toBe("Escolha a forma de pagamento.");
  });
  it("adminRegistrationSchema: alreadyPaid padrao false, 1 a 50 jogadores", () => {
    expect(adminRegistrationSchema.parse({ userIds: ["a"], paymentMethod: "PIX" }).alreadyPaid).toBe(false);
    expect(errorsOf(adminRegistrationSchema.safeParse({ userIds: [], paymentMethod: "PIX" })).userIds).toBe("Escolha pelo menos um jogador.");
    expect(adminRegistrationSchema.safeParse({ userIds: Array.from({ length: 51 }, (_, i) => `u${i}`), paymentMethod: "PIX" }).success).toBe(false);
    expect(adminRegistrationSchema.safeParse({ userIds: [""], paymentMethod: "PIX" }).success).toBe(false);
  });
  it("paymentDecisionSchema", () => {
    expect(paymentDecisionSchema.safeParse({ paymentStatus: "REJECTED", rejectedReason: "Valor errado" }).success).toBe(true);
    expect(paymentDecisionSchema.safeParse({ paymentStatus: "TALVEZ" }).success).toBe(false);
    expect(paymentDecisionSchema.safeParse({ paymentStatus: "REJECTED", rejectedReason: "x".repeat(201) }).success).toBe(false);
  });
});

describe("estrelas e MMR", () => {
  it("starsSchema: meia estrela de 1 a 5", () => {
    for (const ok of [1, 1.5, 3, 4.5, 5, "2.5"]) expect(starsSchema.safeParse({ stars: ok }).success).toBe(true);
    for (const bad of [0, 0.5, 5.5, 3.3, "muitas"]) expect(starsSchema.safeParse({ stars: bad }).success).toBe(false);
  });
  it("starsSchema nao aceita null hoje (a coercao do union transforma null em 0): ver relatorio", () => {
    // Documenta o comportamento atual; o teste de rota marcado com it.failing descreve o esperado.
    expect(starsSchema.safeParse({ stars: null }).success).toBe(false);
  });
  it("mmrAdjustSchema: faixa 600..1600 e motivo de 5 a 300 caracteres", () => {
    expect(mmrAdjustSchema.safeParse({ mmr: 600, reason: "motivo" }).success).toBe(true);
    expect(mmrAdjustSchema.safeParse({ mmr: 1600, reason: "motivo" }).success).toBe(true);
    expect(errorsOf(mmrAdjustSchema.safeParse({ mmr: 599, reason: "motivo" })).mmr).toBe("O MMR vai de 600 a 1600.");
    expect(errorsOf(mmrAdjustSchema.safeParse({ mmr: 1601, reason: "motivo" })).mmr).toBe("O MMR vai de 600 a 1600.");
    expect(errorsOf(mmrAdjustSchema.safeParse({ mmr: 1000, reason: "ab" })).reason).toBe("Explique o motivo em poucas palavras.");
  });
});

describe("papel, sorteio e times", () => {
  it("roleSchema", () => {
    expect(roleSchema.safeParse({ role: "ADMIN" }).success).toBe(true);
    expect(roleSchema.safeParse({ role: "DONO" }).success).toBe(false);
  });
  it("drawSchema: semente opcional inteira", () => {
    expect(drawSchema.parse({})).toEqual({});
    expect(drawSchema.parse({ seed: "42" })).toEqual({ seed: 42 });
    expect(drawSchema.safeParse({ seed: 1.5 }).success).toBe(false);
  });
  it("manualTeamsSchema: 2 a 5 times, nome de 1 a 2 caracteres, reservas padrao vazio", () => {
    const team = (name: string) => ({ name, playerIds: ["a"] });
    expect(manualTeamsSchema.parse({ teams: [team("A"), team("B")] }).reserveIds).toEqual([]);
    expect(errorsOf(manualTeamsSchema.safeParse({ teams: [team("A")] })).teams).toBe("Monte pelo menos dois times.");
    expect(errorsOf(manualTeamsSchema.safeParse({ teams: "ABCDEF".split("").map(team) })).teams).toBe("No maximo cinco times.");
    expect(manualTeamsSchema.safeParse({ teams: [team("ABC"), team("B")] }).success).toBe(false);
  });
});

describe("partida", () => {
  it("matchActionSchema", () => {
    for (const action of ["START", "PAUSE", "RESUME", "END"]) expect(matchActionSchema.safeParse({ action }).success).toBe(true);
    expect(matchActionSchema.safeParse({ action: "VOAR" }).success).toBe(false);
  });
  it("matchEventSchema: assistUserId aceita ausente, nulo ou texto", () => {
    const base = { type: "GOAL", userId: "u", teamId: "t" };
    expect(matchEventSchema.safeParse(base).success).toBe(true);
    expect(matchEventSchema.safeParse({ ...base, assistUserId: null }).success).toBe(true);
    expect(matchEventSchema.safeParse({ ...base, assistUserId: "a" }).success).toBe(true);
    expect(matchEventSchema.safeParse({ ...base, assistUserId: "" }).success).toBe(false);
    expect(matchEventSchema.safeParse({ ...base, type: "CARTAO" }).success).toBe(false);
  });
  it("substitutionSchema: permanent padrao false", () => {
    expect(substitutionSchema.parse({ teamId: "t", outUserId: "a", inUserId: "b" }).permanent).toBe(false);
    expect(substitutionSchema.safeParse({ teamId: "t", outUserId: "a" }).success).toBe(false);
  });
});

describe("sistema e auditoria", () => {
  it("systemSettingsSchema", () => {
    const ok = { publicAccessEnabled: true, privateSiteEnabled: false, registrationOpen: true, maintenanceMessage: "Volto ja" };
    expect(systemSettingsSchema.safeParse(ok).success).toBe(true);
    expect(systemSettingsSchema.safeParse({ ...ok, maintenanceMessage: "ab" }).success).toBe(false);
    expect(systemSettingsSchema.safeParse({ ...ok, maintenanceMessage: "x".repeat(241) }).success).toBe(false);
    expect(systemSettingsSchema.safeParse({ ...ok, registrationOpen: "sim" }).success).toBe(false);
  });
  it("auditQuerySchema: pagina padrao 1, filtros opcionais", () => {
    expect(auditQuerySchema.parse({})).toEqual({ page: 1 });
    expect(auditQuerySchema.parse({ page: "3", entity: " GameDay " })).toEqual({ page: 3, entity: "GameDay" });
    expect(auditQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });
});
