import { beforeAll, describe, expect, it } from "vitest";
import { EncryptJWT } from "jose";
import { SESSION_GRACE_S, SESSION_ROTATE_AFTER_S } from "@/lib/auth/config";
import { classifyToken } from "@/lib/auth/token-state";
import { needsRotation, readSessionCookie, writeSessionCookie } from "@/lib/auth/session-cookie";

const NOW = new Date("2026-09-22T12:00:00Z");
const secondsAgo = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);
const inDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

describe("classifyToken", () => {
  it("token inexistente e unknown", () => {
    expect(classifyToken(null, false, NOW)).toBe("unknown");
  });

  it("token vivo e dentro do prazo e active", () => {
    expect(classifyToken({ revokedAt: null, expiresAt: inDays(10) }, false, NOW)).toBe("active");
  });

  it("token vivo mas fora do prazo e expired", () => {
    expect(classifyToken({ revokedAt: null, expiresAt: secondsAgo(1) }, false, NOW)).toBe("expired");
  });

  it("revogado agora ha pouco, com sucessor vivo, e grace (requisicao em voo)", () => {
    const row = { revokedAt: secondsAgo(5), expiresAt: inDays(30) };
    expect(classifyToken(row, true, NOW)).toBe("grace");
  });

  it("revogado agora ha pouco SEM sucessor e reuso: logout nao ganha graca", () => {
    const row = { revokedAt: secondsAgo(5), expiresAt: inDays(30) };
    expect(classifyToken(row, false, NOW)).toBe("reused");
  });

  it("revogado fora da janela de graca e reuso mesmo com sucessor vivo", () => {
    const row = { revokedAt: secondsAgo(SESSION_GRACE_S + 1), expiresAt: inDays(30) };
    expect(classifyToken(row, true, NOW)).toBe("reused");
  });

  it("o limite da janela de graca ainda e graca", () => {
    const row = { revokedAt: secondsAgo(SESSION_GRACE_S), expiresAt: inDays(30) };
    expect(classifyToken(row, true, NOW)).toBe("grace");
  });
});

describe("needsRotation", () => {
  it("token recem-emitido nao rotaciona", () => {
    expect(needsRotation({ sub: "u", sid: "s", rot: 1_000 }, 1_000 + SESSION_ROTATE_AFTER_S - 1)).toBe(false);
  });

  it("token com a idade de rotacao rotaciona", () => {
    expect(needsRotation({ sub: "u", sid: "s", rot: 1_000 }, 1_000 + SESSION_ROTATE_AFTER_S)).toBe(true);
  });
});

describe("cookie de sessao", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = "segredo-de-teste-com-tamanho-suficiente-000";
  });

  it("ida e volta preserva os tres claims", async () => {
    const claims = { sub: "user-1", sid: "token-opaco", rot: 1_234 };
    const cookie = await writeSessionCookie(claims);
    expect(cookie.split(".")).toHaveLength(5); // JWE compacto, cifrado
    expect(cookie).not.toContain("token-opaco");
    expect(await readSessionCookie(cookie)).toEqual(claims);
  });

  it("o claim pend so aparece quando e verdadeiro", async () => {
    const pending = await writeSessionCookie({ sub: "u", sid: "s", rot: 1, pend: true });
    expect(await readSessionCookie(pending)).toEqual({ sub: "u", sid: "s", rot: 1, pend: true });
    expect(await readSessionCookie(await writeSessionCookie({ sub: "u", sid: "s", rot: 1 }))).not.toHaveProperty("pend");
  });

  it("cookie adulterado nao decifra", async () => {
    const cookie = await writeSessionCookie({ sub: "user-1", sid: "s", rot: 1 });
    const parts = cookie.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("AA") ? "BB" : "AA");
    expect(await readSessionCookie(parts.join("."))).toBeNull();
  });

  it("cookie cifrado com outro segredo nao decifra", async () => {
    const cookie = await writeSessionCookie({ sub: "user-1", sid: "s", rot: 1 });
    process.env.AUTH_SECRET = "outro-segredo-completamente-diferente-111";
    expect(await readSessionCookie(cookie)).toBeNull();
    process.env.AUTH_SECRET = "segredo-de-teste-com-tamanho-suficiente-000";
  });

  it("segredo antigo em AUTH_SECRET_1 continua decifrando durante a troca", async () => {
    const cookie = await writeSessionCookie({ sub: "user-1", sid: "s", rot: 1 });
    process.env.AUTH_SECRET_1 = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "segredo-novo-depois-da-rotacao-2222222222";
    expect(await readSessionCookie(cookie)).toEqual({ sub: "user-1", sid: "s", rot: 1 });
    delete process.env.AUTH_SECRET_1;
    process.env.AUTH_SECRET = "segredo-de-teste-com-tamanho-suficiente-000";
  });

  it("cookie sem os claims da sessao (ex.: de antes da migracao) vale como deslogado", async () => {
    // Um JWE valido, mas no formato antigo: so sub, sem sid nem rot.
    const { encode } = await import("next-auth/jwt");
    const legacy = await encode({
      token: { sub: "user-1", role: "USER" },
      secret: process.env.AUTH_SECRET!,
      salt: "authjs.session-token",
    });
    expect(await readSessionCookie(legacy)).toBeNull();
  });

  it("vazio e lixo sao deslogado, nunca erro", async () => {
    expect(await readSessionCookie(undefined)).toBeNull();
    expect(await readSessionCookie("")).toBeNull();
    expect(await readSessionCookie("nao-e-um-jwe")).toBeNull();
    const plain = await new EncryptJWT({ sub: "x" })
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .encrypt(new Uint8Array(32));
    expect(await readSessionCookie(plain)).toBeNull();
  });
});
