import { afterEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_SCOPES, googleRedirectUri, readGoogleIdClaims } from "@/lib/auth/google-oauth-state";

const CLIENT_ID = "cliente-de-teste.apps.googleusercontent.com";

afterEach(() => vi.unstubAllEnvs());

describe("googleRedirectUri", () => {
  it("usa AUTH_URL e o mesmo caminho que o Auth.js usava", () => {
    vi.stubEnv("AUTH_URL", "https://voacraque.app/");
    expect(googleRedirectUri()).toBe("https://voacraque.app/api/auth/callback/google");
  });

  it("sem AUTH_URL nem NEXTAUTH_URL, lanca (nunca do header Host)", () => {
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "");
    expect(() => googleRedirectUri()).toThrow(/AUTH_URL/);
  });
});

describe("GOOGLE_SCOPES", () => {
  it("pede so identidade", () => {
    expect(GOOGLE_SCOPES).toEqual(["openid", "email", "profile"]);
  });
});

describe("readGoogleIdClaims", () => {
  const valid = {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "1234567890",
    email: "gabriel@example.com",
    email_verified: true,
    name: "Gabriel",
    picture: "https://example.com/foto.png",
  };

  it("aceita um id_token valido e monta o profile", () => {
    expect(readGoogleIdClaims(valid, CLIENT_ID)).toEqual({
      providerAccountId: "1234567890",
      profile: {
        email: "gabriel@example.com",
        email_verified: true,
        name: "Gabriel",
        picture: "https://example.com/foto.png",
      },
    });
  });

  it("aceita os dois formatos de iss do Google", () => {
    expect(readGoogleIdClaims({ ...valid, iss: "accounts.google.com" }, CLIENT_ID)).not.toBeNull();
  });

  it("aud de outro cliente e recusado", () => {
    expect(readGoogleIdClaims({ ...valid, aud: "outro-cliente" }, CLIENT_ID)).toBeNull();
  });

  it("iss estranho e recusado", () => {
    expect(readGoogleIdClaims({ ...valid, iss: "https://evil.example.com" }, CLIENT_ID)).toBeNull();
  });

  it("sem sub (ou sub vazio) e recusado", () => {
    const { sub: _sub, ...semSub } = valid;
    expect(readGoogleIdClaims(semSub, CLIENT_ID)).toBeNull();
    expect(readGoogleIdClaims({ ...valid, sub: "" }, CLIENT_ID)).toBeNull();
  });

  it("claims ausentes viram null no profile; email_verified ausente nao vira true", () => {
    const result = readGoogleIdClaims({ iss: valid.iss, aud: CLIENT_ID, sub: "1" }, CLIENT_ID);
    expect(result?.profile).toEqual({ email: null, email_verified: null, name: null, picture: null });
  });
});
