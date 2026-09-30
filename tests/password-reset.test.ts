import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyResetToken, hashResetToken, buildPasswordResetUrl } from "@/lib/auth/password-reset-state";
import { changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } from "@/lib/validation";
import { sendMail } from "@/lib/mail/mailer";

describe("classifyResetToken", () => {
  const now = new Date("2026-01-01T12:00:00Z");

  it("unknown quando a linha nao existe", () => {
    expect(classifyResetToken(null, now)).toBe("unknown");
  });

  it("valid quando ainda nao foi usado e nao expirou", () => {
    expect(classifyResetToken({ usedAt: null, expiresAt: new Date(now.getTime() + 1000) }, now)).toBe("valid");
  });

  it("used quando ja foi consumido, mesmo dentro do prazo", () => {
    expect(classifyResetToken({ usedAt: now, expiresAt: new Date(now.getTime() + 1000) }, now)).toBe("used");
  });

  it("expired quando passou do prazo", () => {
    expect(classifyResetToken({ usedAt: null, expiresAt: new Date(now.getTime() - 1000) }, now)).toBe("expired");
  });

  it("expiresAt exatamente igual a now conta como expirado", () => {
    expect(classifyResetToken({ usedAt: null, expiresAt: now }, now)).toBe("expired");
  });
});

describe("hashResetToken", () => {
  it("e deterministico, hex de 64 caracteres e diferente do valor puro", () => {
    const raw = "valor-de-teste";
    const hash = hashResetToken(raw);
    expect(hash).toBe(hashResetToken(raw));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(raw);
  });

  it("valores diferentes geram hashes diferentes", () => {
    expect(hashResetToken("a")).not.toBe(hashResetToken("b"));
  });
});

describe("buildPasswordResetUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("usa AUTH_URL, caminho /reset-password e o token no searchParams", () => {
    vi.stubEnv("AUTH_URL", "https://voacraque.app");
    const url = buildPasswordResetUrl("token-abc");
    expect(url.origin).toBe("https://voacraque.app");
    expect(url.pathname).toBe("/reset-password");
    expect(url.searchParams.get("token")).toBe("token-abc");
  });

  it("funciona com AUTH_URL terminando em barra", () => {
    vi.stubEnv("AUTH_URL", "https://voacraque.app/");
    const url = buildPasswordResetUrl("token-abc");
    expect(url.pathname).toBe("/reset-password");
  });

  it("sem AUTH_URL nem NEXTAUTH_URL, lanca erro", () => {
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "");
    expect(() => buildPasswordResetUrl("token-abc")).toThrow();
  });
});

describe("changePasswordSchema", () => {
  it("recusa confirmacao diferente", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "atual12345",
      newPassword: "senhanova123",
      newPasswordConfirm: "outra-coisa",
    });
    expect(result.success).toBe(false);
  });

  it("recusa senha nova curta", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "atual12345",
      newPassword: "curta",
      newPasswordConfirm: "curta",
    });
    expect(result.success).toBe(false);
  });

  it("aceita quando tudo confere", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "atual12345",
      newPassword: "senhanova123",
      newPasswordConfirm: "senhanova123",
    });
    expect(result.success).toBe(true);
  });
});

describe("resetPasswordSchema", () => {
  it("recusa confirmacao diferente", () => {
    const result = resetPasswordSchema.safeParse({
      token: "t".repeat(32),
      password: "senhanova123",
      passwordConfirm: "outra-coisa",
    });
    expect(result.success).toBe(false);
  });

  it("recusa senha curta", () => {
    const result = resetPasswordSchema.safeParse({
      token: "t".repeat(32),
      password: "curta",
      passwordConfirm: "curta",
    });
    expect(result.success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("normaliza o e-mail para minusculo", () => {
    const result = forgotPasswordSchema.safeParse({ email: "Jogador@Exemplo.COM" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("jogador@exemplo.com");
  });
});

describe("sendMail com driver console", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("fora de producao, imprime a mensagem no log", async () => {
    vi.stubEnv("MAIL_DRIVER", "console");
    vi.stubEnv("NODE_ENV", "development");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await sendMail({ to: "a@b.com", subject: "Assunto", text: "corpo do texto", html: "<p>corpo</p>" });

    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][0]).toContain("corpo do texto");
  });

  it("em producao, nao imprime o conteudo da mensagem", async () => {
    vi.stubEnv("MAIL_DRIVER", "console");
    vi.stubEnv("NODE_ENV", "production");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await sendMail({ to: "a@b.com", subject: "Assunto", text: "segredo-do-link", html: "<p>segredo-do-link</p>" });

    expect(info).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0].join(" ")).not.toContain("segredo-do-link");
  });
});
