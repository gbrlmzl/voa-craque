import { loginAction, logoutAction } from "@/actions/auth";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { formData, redirectOf } from "../../helpers/actions";
import { DEFAULT_PASSWORD, createUser, ensureSettings } from "../../helpers/factories";
import { cookieWrites } from "../../helpers/session";

async function loggedIn() {
  const user = await createUser({ username: "gabriel" });
  await redirectOf(loginAction({}, formData({ username: "gabriel", password: DEFAULT_PASSWORD })));
  return user;
}

describe("logoutAction", () => {
  it("revoga a familia do refresh (LOGOUT) e expira os dois cookies", async () => {
    const user = await loggedIn();
    await redirectOf(logoutAction());

    const rows = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].revokedReason).toBe("LOGOUT");

    const expired = cookieWrites().slice(-2);
    expect(expired.map((c) => c.name)).toEqual([ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME]);
    expect(expired.every((c) => c.value === "" && c.options?.maxAge === 0)).toBe(true);
  });

  it("com o site aberto a visitantes volta para /", async () => {
    await loggedIn();
    expect(await redirectOf(logoutAction())).toBe("/");
  });

  it("com o site privado volta para /login", async () => {
    await loggedIn();
    await ensureSettings({ privateSiteEnabled: true });
    expect(await redirectOf(logoutAction())).toBe("/login");
  });

  it("sem sessao nao quebra", async () => {
    expect(await redirectOf(logoutAction())).toBe("/");
  });
});
