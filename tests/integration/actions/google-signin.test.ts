import { googleSignInAction } from "@/actions/auth";
import { OAUTH_COOKIE_NAME } from "@/lib/auth/config";
import { verifyOAuthState } from "@/lib/auth/tokens";
import { formData, redirectOf } from "../../helpers/actions";
import { restoreEnv, stubEnv } from "../../helpers/env";
import { cookieJar } from "../../helpers/next-env";
import { cookieWrites } from "../../helpers/session";

jest.mock("arctic", () => require("../../helpers/google").arcticMock());

afterEach(() => restoreEnv());

describe("googleSignInAction", () => {
  it("sem as variaveis do Google nao faz nada", async () => {
    await expect(googleSignInAction(formData({ proximo: "/ranking" }))).resolves.toBeUndefined();
    expect(cookieWrites()).toHaveLength(0);
  });

  it("com o Google habilitado grava o state assinado (10 min, httpOnly) e redireciona para a tela de autorizacao", async () => {
    stubEnv("AUTH_GOOGLE_ID", "cliente.apps.googleusercontent.com");
    stubEnv("AUTH_GOOGLE_SECRET", "segredo");
    const destination = await redirectOf(googleSignInAction(formData({ proximo: "/game-days/g1" })));
    expect(destination).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?state=/);
    expect(destination).toContain("prompt=select_account");

    const [write] = cookieWrites();
    expect(write.name).toBe(OAUTH_COOKIE_NAME);
    expect(write.options).toMatchObject({ httpOnly: true, sameSite: "lax", maxAge: 600 });
    const saved = await verifyOAuthState(cookieJar()[OAUTH_COOKIE_NAME]);
    expect(saved?.next).toBe("/game-days/g1");
    expect(destination).toContain(`state=${saved?.state}`);
  });

  it("destino externo vira / antes de ir para o Google", async () => {
    stubEnv("AUTH_GOOGLE_ID", "cliente");
    stubEnv("AUTH_GOOGLE_SECRET", "segredo");
    await redirectOf(googleSignInAction(formData({ proximo: "//evil.com" })));
    expect((await verifyOAuthState(cookieJar()[OAUTH_COOKIE_NAME]))?.next).toBe("/");
  });
});
