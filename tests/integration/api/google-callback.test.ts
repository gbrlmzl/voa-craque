import { GET } from "@/app/api/auth/callback/google/route";
import { OAUTH_COOKIE_NAME, REFRESH_COOKIE_NAME } from "@/lib/auth/config";
import { issueRefreshToken } from "@/lib/auth/refresh-tokens";
import { signOAuthState } from "@/lib/auth/tokens";
import { prisma } from "@/lib/prisma";
import { callRoute } from "../../helpers/route";
import { createUser } from "../../helpers/factories";
import { restoreEnv, stubEnv } from "../../helpers/env";
import { setCookie } from "../../helpers/next-env";
import { cookieWrites } from "../../helpers/session";
import { googleIdToken, googleMock } from "../../helpers/google";

jest.mock("arctic", () => require("../../helpers/google").arcticMock());

const CLIENT_ID = "cliente.apps.googleusercontent.com";

async function callback({
  state = "estado-1",
  query = `code=codigo&state=${state}`,
  withCookie = true,
  next = "/game-days/abc",
}: { state?: string; query?: string; withCookie?: boolean; next?: string } = {}) {
  if (withCookie) setCookie(OAUTH_COOKIE_NAME, await signOAuthState({ state: "estado-1", codeVerifier: "verificador", next }));
  return callRoute(GET, { path: `/api/auth/callback/google?${query}` });
}

const claims = (extra: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: CLIENT_ID,
  sub: "google-sub-1",
  email: "novo@gmail.com",
  email_verified: true,
  name: "Novo",
  picture: "https://foto/x.png",
  ...extra,
});

beforeEach(() => {
  stubEnv("AUTH_GOOGLE_ID", CLIENT_ID);
  stubEnv("AUTH_GOOGLE_SECRET", "segredo");
  googleMock.idToken = googleIdToken(claims());
  googleMock.fail = false;
});
afterEach(() => restoreEnv());

describe("GET /api/auth/callback/google", () => {
  it("conta nova: cria o usuario sem senha, abre a sessao e vai para o destino", async () => {
    const res = await callback();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/game-days/abc");

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "novo@gmail.com" },
      include: { authProviders: true },
    });
    expect(user.passwordHash).toBeNull();
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.image).toBe("https://foto/x.png");
    expect(user.authProviders).toHaveLength(1);
    expect(cookieWrites().map((c) => c.name)).toContain(REFRESH_COOKIE_NAME);
    expect((await prisma.refreshToken.findFirstOrThrow({ where: { userId: user.id } })).persistent).toBe(true);
  });

  it("o cookie de state e de uso unico: e apagado ja no primeiro uso", async () => {
    await callback();
    const first = cookieWrites()[0];
    expect(first.name).toBe(OAUTH_COOKIE_NAME);
    expect(first.options?.maxAge).toBe(0);
  });

  it("conta ja vinculada entra sem criar outra", async () => {
    const user = await createUser({ email: "novo@gmail.com", password: null });
    await prisma.userAuthProvider.create({ data: { userId: user.id, provider: "google", providerAccountId: "google-sub-1" } });
    const res = await callback();
    expect(res.headers.get("location")).toBe("/game-days/abc");
    expect(await prisma.user.count()).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).image).toBe("https://foto/x.png");
  });

  it("e-mail de conta com senha: vincula, remove a senha nao verificada e derruba as sessoes", async () => {
    const user = await createUser({ email: "novo@gmail.com" });
    await issueRefreshToken(user.id, { persistent: true });

    const res = await callback();
    expect(res.headers.get("location")).toBe("/game-days/abc");

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { authProviders: true } });
    expect(after.passwordHash).toBeNull();
    expect(after.emailVerifiedAt).not.toBeNull();
    expect(after.authProviders).toHaveLength(1);
    const old = await prisma.refreshToken.findFirstOrThrow({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    expect(old.revokedReason).toBe("GOOGLE_LINKED");
    expect(await prisma.user.count()).toBe(1);
  });

  it("conta com e-mail ja verificado mantem a senha ao vincular o Google", async () => {
    const user = await createUser({ email: "novo@gmail.com" });
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    await callback();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).not.toBeNull();
  });

  it("conta desativada: AccessDenied e nenhuma sessao", async () => {
    await createUser({ email: "novo@gmail.com", active: false });
    const res = await callback();
    expect(res.headers.get("location")).toBe("/login?error=AccessDenied");
    expect(cookieWrites().map((c) => c.name)).not.toContain(REFRESH_COOKIE_NAME);
  });

  it("e-mail nao verificado pelo Google: AccessDenied e nada criado", async () => {
    googleMock.idToken = googleIdToken(claims({ email_verified: false }));
    const res = await callback();
    expect(res.headers.get("location")).toBe("/login?error=AccessDenied");
    expect(await prisma.user.count()).toBe(0);
  });

  it("state da URL diferente do cookie: OAuthCallback", async () => {
    expect((await callback({ query: "code=codigo&state=outro" })).headers.get("location")).toBe("/login?error=OAuthCallback");
  });

  it("sem cookie de state ou vencido: OAuthCallback", async () => {
    expect((await callback({ withCookie: false })).headers.get("location")).toBe("/login?error=OAuthCallback");
  });

  it("sem code: OAuthCallback", async () => {
    expect((await callback({ query: "state=estado-1" })).headers.get("location")).toBe("/login?error=OAuthCallback");
  });

  it("a pessoa cancelou no Google: AccessDenied", async () => {
    expect((await callback({ query: "error=access_denied" })).headers.get("location")).toBe("/login?error=AccessDenied");
  });

  it("troca do code falhou: OAuthCallback", async () => {
    googleMock.fail = true;
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect((await callback()).headers.get("location")).toBe("/login?error=OAuthCallback");
    spy.mockRestore();
  });

  it("id_token de outro cliente (aud) e recusado", async () => {
    googleMock.idToken = googleIdToken(claims({ aud: "outro-cliente" }));
    expect((await callback()).headers.get("location")).toBe("/login?error=OAuthCallback");
  });

  it("sem as variaveis do Google: Configuration", async () => {
    stubEnv("AUTH_GOOGLE_ID", "");
    expect((await callback()).headers.get("location")).toBe("/login?error=Configuration");
  });

  it("destino externo no state vira /", async () => {
    const res = await callback({ next: "//evil.com" });
    expect(res.headers.get("location")).toBe("/");
  });
});
