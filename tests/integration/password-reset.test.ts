import {
  findUsableResetToken,
  issuePasswordResetToken,
  purgeDeadPasswordResetTokens,
  resetPasswordWithToken,
} from "@/lib/auth/password-reset";
import { issueRefreshToken, purgeExpiredRefreshTokens, isPersistentRefresh } from "@/lib/auth/refresh-tokens";
import { prisma } from "@/lib/prisma";
import { createUser } from "../helpers/factories";

describe("findUsableResetToken", () => {
  it("so le: o token continua valido depois da consulta (antivirus abrem o link com GET)", async () => {
    const user = await createUser();
    const raw = await issuePasswordResetToken(user.id);
    expect(await findUsableResetToken(raw)).toEqual({ userId: user.id });
    expect(await findUsableResetToken(raw)).toEqual({ userId: user.id });
    expect((await prisma.passwordResetToken.findFirstOrThrow()).usedAt).toBeNull();
  });

  it("usado, vencido, desconhecido, conta inativa ou sem senha local: nao serve", async () => {
    const user = await createUser();
    const raw = await issuePasswordResetToken(user.id);
    expect(await findUsableResetToken("nao-existe")).toBeNull();

    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await findUsableResetToken(raw)).toBeNull();

    const inactive = await createUser({ active: false });
    expect(await findUsableResetToken(await issuePasswordResetToken(inactive.id))).toBeNull();
    const google = await createUser({ password: null });
    expect(await findUsableResetToken(await issuePasswordResetToken(google.id))).toBeNull();

    const fresh = await issuePasswordResetToken(user.id);
    await resetPasswordWithToken(fresh, "Nova@Senha1");
    expect(await findUsableResetToken(fresh)).toBeNull();
  });
});

describe("resetPasswordWithToken", () => {
  it("motivos de recusa sao distintos para o log e iguais para quem tenta", async () => {
    const user = await createUser();
    expect(await resetPasswordWithToken("x".repeat(43), "Nova@Senha1")).toEqual({ ok: false, reason: "unknown" });

    const used = await issuePasswordResetToken(user.id);
    await resetPasswordWithToken(used, "Nova@Senha1");
    expect(await resetPasswordWithToken(used, "Outra@Senha2")).toEqual({ ok: false, reason: "used" });

    const expired = await issuePasswordResetToken(user.id);
    await prisma.passwordResetToken.updateMany({ where: { usedAt: null }, data: { expiresAt: new Date(Date.now() - 1) } });
    expect(await resetPasswordWithToken(expired, "Outra@Senha2")).toEqual({ ok: false, reason: "expired" });

    const inactive = await createUser({ active: false });
    expect(await resetPasswordWithToken(await issuePasswordResetToken(inactive.id), "Nova@Senha1")).toEqual({ ok: false, reason: "inactive" });
    const google = await createUser({ password: null });
    expect(await resetPasswordWithToken(await issuePasswordResetToken(google.id), "Nova@Senha1")).toEqual({ ok: false, reason: "no_local_password" });
  });

  it("dois envios simultaneos do mesmo link: so um troca a senha", async () => {
    const user = await createUser();
    const raw = await issuePasswordResetToken(user.id);
    const results = await Promise.all([resetPasswordWithToken(raw, "Nova@Senha1"), resetPasswordWithToken(raw, "Outra@Senha2")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: "used" }]);
  });

  it("marca o e-mail como verificado (quem recebeu o link e dono dele)", async () => {
    const user = await createUser();
    await resetPasswordWithToken(await issuePasswordResetToken(user.id), "Nova@Senha1");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).not.toBeNull();
  });
});

describe("purga de tokens", () => {
  it("apaga reset vencido ha mais de um dia e mantem o recente", async () => {
    const user = await createUser();
    await issuePasswordResetToken(user.id);
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: "velho", expiresAt: new Date(Date.now() - 2 * 24 * 3600 * 1000) },
    });
    expect(await purgeDeadPasswordResetTokens()).toBe(1);
    expect(await prisma.passwordResetToken.count()).toBe(1);
  });

  it("apaga refresh vencido ha mais de 30 dias; o recente e o revogado agora ficam (reconhecem reuso)", async () => {
    const user = await createUser();
    await issueRefreshToken(user.id, { persistent: true, now: new Date(Date.now() - 70 * 24 * 3600 * 1000) });
    const revoked = await issueRefreshToken(user.id, { persistent: true });
    await prisma.refreshToken.updateMany({ where: { tokenHash: (await prisma.refreshToken.findFirstOrThrow({ orderBy: { createdAt: "desc" } })).tokenHash }, data: { revokedAt: new Date(), revokedReason: "LOGOUT" } });
    await issueRefreshToken(user.id, { persistent: true });

    expect(await purgeExpiredRefreshTokens()).toBe(1);
    expect(await prisma.refreshToken.count()).toBe(2);
    expect(await isPersistentRefresh(revoked)).toBe(true);
    expect(await isPersistentRefresh(undefined)).toBe(false);
    expect(await isPersistentRefresh("desconhecido")).toBe(false);
  });
});
