import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCESS_REFRESH_MARGIN_S,
  ACCESS_TOKEN_TTL_S,
  OAUTH_STATE_TTL_S,
  REFRESH_GRACE_S,
  REFRESH_TOKEN_TTL_S,
} from "@/lib/auth/config";
import { buildSessionCookies, expiredSessionCookies } from "@/lib/auth/session-cookies";
import {
  needsRefresh,
  signAccessToken,
  signOAuthState,
  verifyAccessToken,
  verifyOAuthState,
} from "@/lib/auth/tokens";

const SECRET_A = "segredo-de-teste-A-com-tamanho-suficiente-000";
const SECRET_B = "segredo-de-teste-B-com-tamanho-suficiente-111";
const NOW = new Date("2026-09-30T12:00:00Z");
const NOW_S = Math.floor(NOW.getTime() / 1000);
const plusSeconds = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", SECRET_A);
  vi.stubEnv("AUTH_SECRET_1", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("constantes da sessao", () => {
  // Pega tambem uma alteracao temporaria (ex.: expiracao acelerada) que ficou para tras.
  it("15 min de access, 7 dias de refresh, 10 s de graca, 60 s de margem", () => {
    expect(ACCESS_TOKEN_TTL_S).toBe(900);
    expect(REFRESH_TOKEN_TTL_S).toBe(604800);
    expect(REFRESH_GRACE_S).toBe(10);
    expect(ACCESS_REFRESH_MARGIN_S).toBe(60);
    expect(OAUTH_STATE_TTL_S).toBe(600);
  });
});

describe("access token", () => {
  it("ida e volta devolve o sub e o exp de 15 minutos", async () => {
    const token = await signAccessToken("user-1", NOW);
    expect(await verifyAccessToken(token, NOW)).toEqual({ sub: "user-1", exp: NOW_S + 900 });
  });

  it("e um JWS compacto (tres partes), nao um JWE (cinco)", async () => {
    const token = await signAccessToken("user-1", NOW);
    expect(token.split(".")).toHaveLength(3);
  });

  it("vale ate o ultimo segundo e expira aos 900 s", async () => {
    const token = await signAccessToken("user-1", NOW);
    expect(await verifyAccessToken(token, plusSeconds(899))).not.toBeNull();
    expect(await verifyAccessToken(token, plusSeconds(900))).toBeNull();
  });

  it("nao verifica como state do OAuth, e o state nao verifica como access", async () => {
    const access = await signAccessToken("user-1", NOW);
    const state = await signOAuthState({ state: "s", codeVerifier: "v", next: "/" }, NOW);
    expect(await verifyOAuthState(access, NOW)).toBeNull();
    expect(await verifyAccessToken(state, NOW)).toBeNull();
  });

  it("trocar o sub no payload, mantendo a assinatura, invalida", async () => {
    const [header, payload, signature] = (await signAccessToken("user-1", NOW)).split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const forged = [header, base64url({ ...claims, sub: "superadmin" }), signature].join(".");
    expect(await verifyAccessToken(forged, NOW)).toBeNull();
  });

  it('cabecalho {"alg":"none"} com assinatura vazia e recusado', async () => {
    const [, payload] = (await signAccessToken("user-1", NOW)).split(".");
    const unsigned = `${base64url({ alg: "none", typ: "JWT" })}.${payload}.`;
    expect(await verifyAccessToken(unsigned, NOW)).toBeNull();
  });

  it("assinado com outro segredo nao verifica", async () => {
    const token = await signAccessToken("user-1", NOW);
    vi.stubEnv("AUTH_SECRET", SECRET_B);
    expect(await verifyAccessToken(token, NOW)).toBeNull();
  });

  it("troca de segredo: o antigo em AUTH_SECRET_1 ainda verifica, e os tokens novos saem com o novo", async () => {
    const oldToken = await signAccessToken("user-1", NOW);

    vi.stubEnv("AUTH_SECRET", SECRET_B);
    vi.stubEnv("AUTH_SECRET_1", SECRET_A);
    expect(await verifyAccessToken(oldToken, NOW)).not.toBeNull();

    const newToken = await signAccessToken("user-1", NOW);
    expect(await verifyAccessToken(newToken, NOW)).not.toBeNull();

    // So o segredo antigo, sem o novo: o token novo nao valida.
    vi.stubEnv("AUTH_SECRET", SECRET_A);
    vi.stubEnv("AUTH_SECRET_1", "");
    expect(await verifyAccessToken(newToken, NOW)).toBeNull();
  });

  it("AUTH_SECRET curto ou ausente rejeita a assinatura com erro", async () => {
    vi.stubEnv("AUTH_SECRET", "curto");
    await expect(signAccessToken("user-1", NOW)).rejects.toThrow(/AUTH_SECRET/);
    vi.stubEnv("AUTH_SECRET", "");
    await expect(signAccessToken("user-1", NOW)).rejects.toThrow(/AUTH_SECRET/);
  });

  it.each([[undefined], [""], ["lixo"], ["a.b.c"]])("valor %j vira null, nunca excecao", async (value) => {
    await expect(verifyAccessToken(value, NOW)).resolves.toBeNull();
  });
});

describe("needsRefresh", () => {
  it("sem access valido, renova", () => {
    expect(needsRefresh(null, NOW)).toBe(true);
  });

  it("com 61 s de vida nao renova; com 59 s renova", () => {
    expect(needsRefresh({ sub: "u", exp: NOW_S + 61 }, NOW)).toBe(false);
    expect(needsRefresh({ sub: "u", exp: NOW_S + 59 }, NOW)).toBe(true);
  });
});

describe("state do OAuth", () => {
  const value = { state: "estado", codeVerifier: "verificador", next: "/game-days" };

  it("ida e volta preserva os tres campos", async () => {
    const token = await signOAuthState(value, NOW);
    expect(await verifyOAuthState(token, NOW)).toEqual(value);
  });

  it("expira em 10 minutos", async () => {
    const token = await signOAuthState(value, NOW);
    expect(await verifyOAuthState(token, plusSeconds(599))).not.toBeNull();
    expect(await verifyOAuthState(token, plusSeconds(600))).toBeNull();
  });
});

describe("cookies de sessao", () => {
  it("nomes sem prefixo em http, validades e atributos", async () => {
    const [access, refresh] = await buildSessionCookies({ userId: "user-1", refreshToken: "opaco" }, NOW);

    expect(access.name).toBe("voacraque.session");
    expect(refresh.name).toBe("voacraque.refresh");
    expect(access.options.maxAge).toBe(900);
    expect(refresh.options.maxAge).toBe(604800);
    for (const cookie of [access, refresh]) {
      expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    }

    expect(await verifyAccessToken(access.value, NOW)).toEqual({ sub: "user-1", exp: NOW_S + 900 });
    expect(refresh.value).toBe("opaco");
  });

  it("os cookies expirados sao dois, vazios, com Max-Age 0", () => {
    const cookies = expiredSessionCookies();
    expect(cookies.map((cookie) => cookie.name)).toEqual(["voacraque.session", "voacraque.refresh"]);
    for (const cookie of cookies) {
      expect(cookie.value).toBe("");
      expect(cookie.options.maxAge).toBe(0);
    }
  });

  it("em https (producao): Secure e prefixo __Host- nos tres cookies", async () => {
    vi.stubEnv("AUTH_URL", "https://voacraque.app");
    vi.resetModules();
    const config = await import("@/lib/auth/config");
    const cookies = await import("@/lib/auth/session-cookies");

    expect(config.COOKIE_BASE_OPTIONS.secure).toBe(true);
    for (const name of [config.ACCESS_COOKIE_NAME, config.REFRESH_COOKIE_NAME, config.OAUTH_COOKIE_NAME]) {
      expect(name.startsWith("__Host-")).toBe(true);
    }

    // Apagar um __Host- exige os mesmos atributos: secure e path "/".
    const written = [...(await cookies.buildSessionCookies({ userId: "u", refreshToken: "r" }, NOW)), ...cookies.expiredSessionCookies()];
    for (const cookie of written) {
      expect(cookie.name.startsWith("__Host-")).toBe(true);
      expect(cookie.options).toMatchObject({ secure: true, httpOnly: true, path: "/" });
    }
  });

  it("em http://localhost: sem Secure e sem prefixo", async () => {
    vi.stubEnv("AUTH_URL", "http://localhost:3000");
    vi.resetModules();
    const config = await import("@/lib/auth/config");

    expect(config.COOKIE_BASE_OPTIONS.secure).toBe(false);
    expect(config.ACCESS_COOKIE_NAME).toBe("voacraque.session");
    expect(config.REFRESH_COOKIE_NAME).toBe("voacraque.refresh");
    expect(config.OAUTH_COOKIE_NAME).toBe("voacraque.oauth");
  });
});
