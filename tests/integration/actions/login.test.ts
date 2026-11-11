import { loginAction } from "@/actions/auth";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { formData, redirectOf } from "../../helpers/actions";
import { DEFAULT_PASSWORD, createUser } from "../../helpers/factories";
import { cookieWrites } from "../../helpers/session";
import { securityEvents } from "../../helpers/logs";

const WRONG = "Usuário ou senha não conferem.";

describe("loginAction", () => {
  it("credenciais certas gravam os dois cookies e redirecionam para o proximo seguro", async () => {
    const user = await createUser({ username: "gabriel" });
    const destination = await redirectOf(
      loginAction({}, formData({ username: "gabriel", password: DEFAULT_PASSWORD, proximo: "/game-days/abc?x=1" })),
    );
    expect(destination).toBe("/game-days/abc?x=1");
    expect(cookieWrites().map((c) => c.name)).toEqual([ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME]);
    expect(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(1);
  });

  it("o username entra sem diferenciar maiusculas", async () => {
    await createUser({ username: "gabriel" });
    const destination = await redirectOf(
      loginAction({}, formData({ username: "  GABRIEL ", password: DEFAULT_PASSWORD })),
    );
    expect(destination).toBe("/");
  });

  it.each(["//evil.com", "https://evil.com", "/\\evil.com", "evil"])("proximo externo %s vira /", async (proximo) => {
    await createUser({ username: "gabriel" });
    expect(
      await redirectOf(loginAction({}, formData({ username: "gabriel", password: DEFAULT_PASSWORD, proximo }))),
    ).toBe("/");
  });

  it("senha errada e usuario inexistente dao a mesma mensagem e nao gravam cookie", async () => {
    await createUser({ username: "gabriel" });
    const wrongPassword = await loginAction({}, formData({ username: "gabriel", password: "Errada@1" }));
    const unknownUser = await loginAction({}, formData({ username: "fantasma", password: "Errada@1" }));
    expect(wrongPassword).toEqual({ message: WRONG });
    expect(unknownUser).toEqual({ message: WRONG });
    expect(cookieWrites()).toHaveLength(0);
    expect(securityEvents().map((e) => e.reason)).toEqual(["invalid_password", "user_not_found"]);
  });

  it("conta desativada nao entra, mesmo com a senha certa", async () => {
    await createUser({ username: "inativo", active: false });
    expect(await loginAction({}, formData({ username: "inativo", password: DEFAULT_PASSWORD }))).toEqual({
      message: WRONG,
    });
    expect(securityEvents().at(-1)?.reason).toBe("inactive");
  });

  it("conta so do Google (sem senha local) nao entra por senha", async () => {
    await createUser({ username: "google", password: null });
    expect(await loginAction({}, formData({ username: "google", password: DEFAULT_PASSWORD }))).toEqual({
      message: WRONG,
    });
  });

  it("campos vazios devolvem erro por campo", async () => {
    const state = await loginAction({}, formData({ username: "", password: "" }));
    expect(state.fieldErrors).toEqual({ username: "Informe o usuário.", password: "Informe a senha." });
  });

  it("a 9a tentativa do mesmo IP e bloqueada, ate com a senha certa", async () => {
    await createUser({ username: "gabriel" });
    for (let i = 0; i < 8; i++) {
      expect(await loginAction({}, formData({ username: "gabriel", password: "Errada@1" }))).toEqual({ message: WRONG });
    }
    const blocked = await loginAction({}, formData({ username: "gabriel", password: DEFAULT_PASSWORD }));
    expect(blocked.message).toMatch(/Muitas tentativas de login/);
    expect(cookieWrites()).toHaveLength(0);
  });

  it("manter login: cookies de 30 dias e refresh persistente", async () => {
    const user = await createUser({ username: "gabriel" });
    await redirectOf(loginAction({}, formData({ username: "gabriel", password: DEFAULT_PASSWORD, keepLoggedIn: true })));
    const [access, refresh] = cookieWrites();
    expect(access.options?.maxAge).toBe(15 * 60);
    expect(refresh.options?.maxAge).toBe(30 * 24 * 60 * 60);
    expect((await prisma.refreshToken.findFirstOrThrow({ where: { userId: user.id } })).persistent).toBe(true);
  });

  it("sem manter login: cookies de sessao e refresh nao persistente", async () => {
    const user = await createUser({ username: "gabriel" });
    await redirectOf(loginAction({}, formData({ username: "gabriel", password: DEFAULT_PASSWORD })));
    const [access, refresh] = cookieWrites();
    expect(access.options?.maxAge).toBeUndefined();
    expect(refresh.options?.maxAge).toBeUndefined();
    expect((await prisma.refreshToken.findFirstOrThrow({ where: { userId: user.id } })).persistent).toBe(false);
  });
});
