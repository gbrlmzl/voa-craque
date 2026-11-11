import {
  assertSiteOpen,
  getCurrentUser,
  getSystemSettings,
  pageAdmin,
  pageSuperadmin,
  pageUser,
  pageUserWithProfile,
  pageViewer,
  requireAdmin,
  requireSuperadmin,
  requireUser,
  requireViewer,
} from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { redirectOf } from "../helpers/actions";
import { createAdmin, createPlayer, createSuperadmin, createUser, ensureSettings } from "../helpers/factories";
import { actAs, asVisitor } from "../helpers/session";
import { setCookie } from "../helpers/next-env";
import { ACCESS_COOKIE_NAME } from "@/lib/auth/config";
import { signAccessToken } from "@/lib/auth/tokens";

const status = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return 200;
  } catch (error) {
    return (error as { status?: number }).status ?? 500;
  }
};

describe("getCurrentUser", () => {
  it("sem cookie, com cookie lixo ou de usuario inexistente: null", async () => {
    expect(await getCurrentUser()).toBeNull();
    setCookie(ACCESS_COOKIE_NAME, "lixo");
    expect(await getCurrentUser()).toBeNull();
    setCookie(ACCESS_COOKIE_NAME, await signAccessToken("nao-existe"));
    expect(await getCurrentUser()).toBeNull();
  });

  it("usuario desativado vale como deslogado na hora", async () => {
    const user = await createPlayer();
    await actAs(user);
    expect(await getCurrentUser()).not.toBeNull();
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    expect(await getCurrentUser()).toBeNull();
  });

  it("devolve so o que o cliente pode ver, com o papel vindo do banco", async () => {
    const user = await createPlayer({ username: "gabriel", profile: { name: "Gabriel", photoUrl: "/foto.webp" } });
    await actAs(user);
    expect(await getCurrentUser()).toEqual({
      id: user.id,
      email: user.email,
      username: "gabriel",
      name: "Gabriel",
      role: "USER",
      profileCompleted: true,
      photoUrl: "/foto.webp",
      hasPassword: true,
      googleLinked: false,
    });
    await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    expect((await getCurrentUser())?.role).toBe("ADMIN");
  });

  it("conta so do Google: sem senha local, Google vinculado e foto da conta Google", async () => {
    const user = await createUser({ password: null });
    await prisma.user.update({ where: { id: user.id }, data: { image: "https://google/foto.png" } });
    await prisma.userAuthProvider.create({ data: { userId: user.id, provider: "google", providerAccountId: "g1" } });
    await actAs(user);
    const current = await getCurrentUser();
    expect(current).toMatchObject({ hasPassword: false, googleLinked: true, photoUrl: "https://google/foto.png", profileCompleted: false, name: null });
  });
});

describe("guardas de API", () => {
  it("requireUser: 401 sem sessao, ok com sessao", async () => {
    expect(await status(requireUser())).toBe(401);
    await actAs(await createPlayer());
    expect(await status(requireUser())).toBe(200);
  });

  it("requireAdmin: 403 para jogador, ok para organizador e superadmin", async () => {
    await actAs(await createPlayer());
    expect(await status(requireAdmin())).toBe(403);
    await actAs(await createAdmin());
    expect(await status(requireAdmin())).toBe(200);
    await actAs(await createSuperadmin());
    expect(await status(requireAdmin())).toBe(200);
  });

  it("requireSuperadmin: so o superadmin", async () => {
    await actAs(await createAdmin());
    expect(await status(requireSuperadmin())).toBe(403);
    await actAs(await createSuperadmin());
    expect(await status(requireSuperadmin())).toBe(200);
  });

  it("manutencao barra todo mundo, menos o superadmin", async () => {
    await ensureSettings({ publicAccessEnabled: false });
    await actAs(await createAdmin());
    expect(await status(requireUser())).toBe(403);
    await actAs(await createSuperadmin());
    expect(await status(requireUser())).toBe(200);
    expect(await status(assertSiteOpen(null))).toBe(403);
  });

  it("requireViewer: visitante entra com o site aberto; 401 no privado; 403 na manutencao", async () => {
    asVisitor();
    expect(await requireViewer()).toBeNull();

    await ensureSettings({ privateSiteEnabled: true });
    expect(await status(requireViewer())).toBe(401);
    await actAs(await createPlayer());
    expect((await requireViewer())?.role).toBe("USER");

    await ensureSettings({ publicAccessEnabled: false });
    expect(await status(requireViewer())).toBe(403);
  });
});

describe("getSystemSettings", () => {
  it("cria a linha global com os padroes quando falta", async () => {
    expect(await prisma.systemSetting.count()).toBe(0);
    const settings = await getSystemSettings();
    expect(settings).toMatchObject({ id: "global", publicAccessEnabled: true, privateSiteEnabled: false, registrationOpen: true });
    expect(await prisma.systemSetting.count()).toBe(1);
  });

  it("devolve a existente sem recriar", async () => {
    await ensureSettings({ registrationOpen: false });
    expect((await getSystemSettings()).registrationOpen).toBe(false);
    expect(await prisma.systemSetting.count()).toBe(1);
  });
});

describe("guardas de pagina", () => {
  it("pageUser: visitante vai para /login com o caminho", async () => {
    expect(await redirectOf(pageUser("/game-days/g1"))).toBe("/login?proximo=%2Fgame-days%2Fg1");
    expect(await redirectOf(pageUser())).toBe("/login");
  });

  it("pageUser: manutencao manda para /maintenance", async () => {
    await ensureSettings({ publicAccessEnabled: false });
    await actAs(await createPlayer());
    expect(await redirectOf(pageUser())).toBe("/maintenance");
  });

  it("pageUserWithProfile: sem perfil completo vai para o onboarding", async () => {
    const user = await createUser({ profile: false });
    await actAs(user);
    expect(await redirectOf(pageUserWithProfile("/game-days/g1"))).toBe("/onboarding?proximo=%2Fgame-days%2Fg1");
  });

  it("pageViewer: site aberto deixa o visitante ver; privado vai para /login; manutencao para /maintenance", async () => {
    asVisitor();
    expect(await pageViewer("/ranking")).toBeNull();
    await ensureSettings({ privateSiteEnabled: true });
    expect(await redirectOf(pageViewer("/ranking"))).toBe("/login?proximo=%2Franking");
    await ensureSettings({ publicAccessEnabled: false });
    expect(await redirectOf(pageViewer("/ranking"))).toBe("/maintenance");
  });

  it("pageViewer: logado sem perfil vai para o onboarding", async () => {
    await actAs(await createUser({ profile: false }));
    expect(await redirectOf(pageViewer("/ranking"))).toBe("/onboarding?proximo=%2Franking");
  });

  it("pageAdmin e pageSuperadmin mandam o resto para /", async () => {
    await actAs(await createPlayer());
    expect(await redirectOf(pageAdmin("/admin"))).toBe("/");
    expect(await redirectOf(pageSuperadmin("/admin/system"))).toBe("/");
    await actAs(await createAdmin());
    expect((await pageAdmin("/admin")).role).toBe("ADMIN");
    expect(await redirectOf(pageSuperadmin("/admin/system"))).toBe("/");
    await actAs(await createSuperadmin());
    expect((await pageSuperadmin("/admin/system")).role).toBe("SUPERADMIN");
  });
});
