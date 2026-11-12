import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from "@/lib/auth/config";
import { issueRefreshToken } from "@/lib/auth/refresh-tokens";
import { signAccessToken } from "@/lib/auth/tokens";
import { prisma } from "@/lib/prisma";
import { createUser } from "../helpers/factories";

type Options = { cookies?: Record<string, string>; method?: string; headers?: Record<string, string> };

function request(path: string, { cookies = {}, method = "GET", headers = {} }: Options = {}) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return new NextRequest(`http://localhost:3100${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...headers },
  });
}

const redirectsTo = (res: Response) => (res.headers.get("location") ? new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search : null);
const passes = (res: Response) => res.headers.get("x-middleware-next") === "1";
const setCookies = (res: Response) => res.headers.getSetCookie();

async function session(opts: { access?: boolean; accessAgeS?: number; refresh?: boolean; active?: boolean } = {}) {
  const user = await createUser({ active: opts.active ?? true });
  const cookies: Record<string, string> = {};
  if (opts.access !== false) {
    const issuedAt = new Date(Date.now() - (opts.accessAgeS ?? 0) * 1000);
    cookies[ACCESS_COOKIE_NAME] = await signAccessToken(user.id, issuedAt);
  }
  if (opts.refresh) cookies[REFRESH_COOKIE_NAME] = await issueRefreshToken(user.id, { persistent: true });
  return { user, cookies };
}

describe("proxy: guarda de rota", () => {
  it("pagina protegida sem sessao vai para /login com o proximo (caminho + query)", async () => {
    const res = await proxy(request("/game-days/new?x=1"));
    expect(redirectsTo(res)).toBe("/login?proximo=%2Fgame-days%2Fnew%3Fx%3D1");
  });

  it("pagina protegida na raiz-equivalente nao leva proximo", async () => {
    const res = await proxy(request("/onboarding"));
    expect(redirectsTo(res)).toBe("/login?proximo=%2Fonboarding");
  });

  it("API protegida sem sessao responde 401 em JSON", async () => {
    const res = await proxy(request("/api/profile"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Faça login para continuar." });
  });

  it("paginas e APIs de consulta passam sem sessao", async () => {
    for (const path of ["/", "/ranking", "/game-days", "/game-days/g1", "/game-days/g1/live", "/game-days/g1/stats", "/api/players/p1", "/api/game-days/g1/live", "/maintenance", "/reset-password", "/login"]) {
      expect(passes(await proxy(request(path)))).toBe(true);
    }
  });

  it("endpoints de auth nao sao tocados nem com cookie lixo", async () => {
    const res = await proxy(request("/api/auth/refresh", { method: "POST", cookies: { [ACCESS_COOKIE_NAME]: "lixo" } }));
    expect(passes(res)).toBe(true);
    expect(setCookies(res)).toHaveLength(0);
  });

  it("com access valido a pagina protegida passa sem tocar no banco", async () => {
    const { cookies } = await session();
    const res = await proxy(request("/game-days/new", { cookies }));
    expect(passes(res)).toBe(true);
    expect(setCookies(res)).toHaveLength(0);
  });

  it("rota so-de-deslogado com sessao viva vai para / ou para o proximo seguro", async () => {
    const { cookies } = await session({ refresh: true });
    expect(redirectsTo(await proxy(request("/login", { cookies })))).toBe("/");
    expect(redirectsTo(await proxy(request("/login?proximo=/game-days/g1", { cookies })))).toBe("/game-days/g1");
    expect(redirectsTo(await proxy(request("/register?proximo=//evil.com", { cookies })))).toBe("/");
    expect(redirectsTo(await proxy(request("/login?proximo=/onboarding", { cookies })))).toBe("/");
  });

  it("POST em rota so-de-deslogado (Server Action de uma aba antiga) nao redireciona", async () => {
    const { cookies } = await session({ refresh: true });
    expect(passes(await proxy(request("/login", { method: "POST", cookies })))).toBe(true);
  });

  it("access valido de sessao ja encerrada: /login limpa os cookies em vez de entrar em laco", async () => {
    const { user, cookies } = await session({ refresh: true });
    await prisma.refreshToken.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date(), revokedReason: "PASSWORD_RESET" } });
    const res = await proxy(request("/login", { cookies }));
    expect(passes(res)).toBe(true);
    expect(setCookies(res).every((line) => /Max-Age=0/i.test(line))).toBe(true);
    expect(setCookies(res)).toHaveLength(2);
  });

  it("conta desativada com access valido tambem nao fica presa no laco", async () => {
    const { cookies } = await session({ active: false });
    const res = await proxy(request("/login", { cookies }));
    expect(passes(res)).toBe(true);
    expect(setCookies(res)).toHaveLength(2);
  });
});

describe("proxy: renovacao da sessao", () => {
  it("access vencendo + refresh valido: cookies novos na resposta e no request", async () => {
    const { user, cookies } = await session({ refresh: true, accessAgeS: 15 * 60 - 30 });
    const res = await proxy(request("/game-days/new", { cookies }));
    expect(passes(res)).toBe(true);
    const lines = setCookies(res);
    expect(lines.some((line) => line.startsWith(`${ACCESS_COOKIE_NAME}=`))).toBe(true);
    expect(lines.some((line) => line.startsWith(`${REFRESH_COOKIE_NAME}=`))).toBe(true);
    expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(2);
  });

  it("access ausente + refresh valido renova e deixa entrar na pagina protegida", async () => {
    const { cookies } = await session({ access: false, refresh: true });
    const res = await proxy(request("/game-days/new", { cookies }));
    expect(passes(res)).toBe(true);
    expect(setCookies(res).length).toBe(2);
  });

  it("access ainda longe de vencer nao rotaciona", async () => {
    const { user, cookies } = await session({ refresh: true, accessAgeS: 60 });
    await proxy(request("/game-days/new", { cookies }));
    expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(1);
  });

  it("refresh revogado: sessao acabou, cookies apagados e protegida vai para /login", async () => {
    const { user, cookies } = await session({ access: false, refresh: true });
    await prisma.refreshToken.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date(), revokedReason: "LOGOUT" } });
    const res = await proxy(request("/game-days/new", { cookies }));
    expect(redirectsTo(res)).toBe("/login?proximo=%2Fgame-days%2Fnew");
    expect(setCookies(res).every((line) => /Max-Age=0/i.test(line))).toBe(true);
    expect(setCookies(res)).toHaveLength(2);
  });

  it("API protegida com refresh morto responde 401 e apaga os cookies", async () => {
    const { cookies } = await session({ access: false, refresh: true });
    cookies[REFRESH_COOKIE_NAME] = "desconhecido";
    const res = await proxy(request("/api/profile", { cookies }));
    expect(res.status).toBe(401);
    expect(setCookies(res)).toHaveLength(2);
  });

  it("access lixo sem refresh: so limpa o cookie, sem consultar o banco", async () => {
    const res = await proxy(request("/ranking", { cookies: { [ACCESS_COOKIE_NAME]: "lixo" } }));
    expect(passes(res)).toBe(true);
    expect(setCookies(res)).toHaveLength(2);
  });

  it("prefetch especulativo nao rotaciona o refresh", async () => {
    const { user, cookies } = await session({ access: false, refresh: true });
    const res = await proxy(request("/game-days/new", { cookies, headers: { purpose: "prefetch" } }));
    expect(redirectsTo(res)).toBe("/login?proximo=%2Fgame-days%2Fnew");
    expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(1);
  });

  it("POST de login (Server Action) nao rotaciona: o Set-Cookie dela substituiria o do proxy", async () => {
    const { user, cookies } = await session({ access: false, refresh: true });
    await proxy(request("/login", { method: "POST", cookies }));
    expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(1);
  });

  it("banco fora do ar nao desloga: segue com o que o access diz", async () => {
    const { cookies } = await session({ refresh: true, accessAgeS: 15 * 60 - 30 });
    const spy = jest.spyOn(prisma.refreshToken, "findUnique").mockRejectedValueOnce(new Error("db fora"));
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await proxy(request("/game-days/new", { cookies }));
    expect(passes(res)).toBe(true);
    expect(setCookies(res)).toHaveLength(0);
    spy.mockRestore();
    errors.mockRestore();
  });
});
