import { POST } from "@/app/api/auth/refresh/route";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from "@/lib/auth/config";
import { hashRefreshToken } from "@/lib/auth/refresh-token-state";
import { issueRefreshToken } from "@/lib/auth/refresh-tokens";
import { prisma } from "@/lib/prisma";
import { callRoute } from "../../helpers/route";
import { createUser } from "../../helpers/factories";
import { securityEvents } from "../../helpers/logs";

const refresh = (raw?: string) =>
  callRoute(POST, { method: "POST", path: "/api/auth/refresh", cookies: raw ? { [REFRESH_COOKIE_NAME]: raw } : {} });

const cookiesSet = (res: Awaited<ReturnType<typeof refresh>>) =>
  Object.fromEntries(
    res.headers.getSetCookie().map((line) => {
      const [pair] = line.split(";");
      const [name, ...value] = pair.split("=");
      return [name, decodeURIComponent(value.join("="))];
    }),
  );

describe("POST /api/auth/refresh", () => {
  it("troca o refresh por um par novo e aposenta o antigo (ROTATED)", async () => {
    const user = await createUser();
    const raw = await issueRefreshToken(user.id, { persistent: true });

    const res = await refresh(raw);
    expect(res.status).toBe(204);
    const set = cookiesSet(res);
    expect(set[ACCESS_COOKIE_NAME]).toBeTruthy();
    expect(set[REFRESH_COOKIE_NAME]).toBeTruthy();
    expect(set[REFRESH_COOKIE_NAME]).not.toBe(raw);

    const rows = await prisma.refreshToken.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0].revokedReason).toBe("ROTATED");
    expect(rows[1].revokedAt).toBeNull();
    expect(rows[1].familyId).toBe(rows[0].familyId);
    expect(rows[1].persistent).toBe(true);
  });

  it("o sucessor herda o 'nao manter login' da familia", async () => {
    const user = await createUser();
    const raw = await issueRefreshToken(user.id, { persistent: false });
    const set = cookiesSet(await refresh(raw));
    expect(set[REFRESH_COOKIE_NAME]).toBeTruthy();
    expect(await prisma.refreshToken.count({ where: { userId: user.id, persistent: false } })).toBe(2);
  });

  it("reuso dentro da janela de graca (10 s) ainda e aceito", async () => {
    const user = await createUser();
    const raw = await issueRefreshToken(user.id, { persistent: true });
    expect((await refresh(raw)).status).toBe(204);
    expect((await refresh(raw)).status).toBe(204);
    expect(securityEvents().map((e) => e.event)).toContain("refresh_token_grace_reuse");
  });

  it("reuso fora da graca revoga a familia inteira (REUSE_DETECTED)", async () => {
    const user = await createUser();
    const raw = await issueRefreshToken(user.id, { persistent: true });
    await refresh(raw);
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashRefreshToken(raw) },
      data: { revokedAt: new Date(Date.now() - 11_000) },
    });

    const res = await refresh(raw);
    expect(res.status).toBe(401);
    expect(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    expect(
      (await prisma.refreshToken.findMany({ where: { userId: user.id, revokedReason: "REUSE_DETECTED" } })).length,
    ).toBe(1);
    expect(securityEvents().map((e) => e.event)).toContain("refresh_token_reuse");
  });

  it("refresh vencido, desconhecido ou ausente: 401 e cookies apagados", async () => {
    const user = await createUser();
    const raw = await issueRefreshToken(user.id, { persistent: true, now: new Date(Date.now() - 40 * 24 * 3600 * 1000) });

    for (const value of [raw, "nao-existe", undefined]) {
      const res = await refresh(value);
      expect(res.status).toBe(401);
      expect(res.json.error).toMatch(/Sessão expirada/);
      const lines = res.headers.getSetCookie();
      expect(lines).toHaveLength(2);
      expect(lines.every((line) => /Max-Age=0/i.test(line))).toBe(true);
    }
  });

  it("refresh revogado (logout) nao renova", async () => {
    const user = await createUser();
    const raw = await issueRefreshToken(user.id, { persistent: true });
    await prisma.refreshToken.updateMany({ data: { revokedAt: new Date(), revokedReason: "LOGOUT" } });
    expect((await refresh(raw)).status).toBe(401);
    expect(securityEvents().map((e) => e.event)).toContain("refresh_token_revoked_use");
  });

  it("usuario desativado nao renova e a familia continua intacta", async () => {
    const user = await createUser({ active: false });
    const raw = await issueRefreshToken(user.id, { persistent: true });
    expect((await refresh(raw)).status).toBe(401);
    expect(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(1);
  });

  it("a 31a chamada do mesmo IP recebe 429 com Retry-After", async () => {
    for (let i = 0; i < 30; i++) await refresh("lixo");
    const res = await refresh("lixo");
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
