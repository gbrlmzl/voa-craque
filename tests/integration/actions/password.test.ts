import { loginAction } from "@/actions/auth";
import {
  changePasswordAction,
  forgotPasswordAction,
  resetPasswordAction,
} from "@/actions/password";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from "@/lib/auth/config";
import { hashResetToken, issuePasswordResetToken } from "@/lib/auth/password-reset";
import { issueRefreshToken } from "@/lib/auth/refresh-tokens";
import { prisma } from "@/lib/prisma";
import { formData, redirectOf } from "../../helpers/actions";
import { DEFAULT_PASSWORD, createUser } from "../../helpers/factories";
import { flushAfter, mailbox } from "../../helpers/next-env";
import { lastResetLink } from "../../helpers/mail";
import { actAs, asVisitor, cookieWrites } from "../../helpers/session";
import { setCookie } from "../../helpers/next-env";

const NEW_PASSWORD = "Nova@Senha1";

describe("changePasswordAction", () => {
  const change = (current: string, next = NEW_PASSWORD, confirm = next) =>
    changePasswordAction(
      {},
      formData({ currentPassword: current, newPassword: next, newPasswordConfirm: confirm }),
    );

  it("sem sessao manda para /login", async () => {
    asVisitor();
    expect(await redirectOf(change(DEFAULT_PASSWORD))).toBe("/login");
  });

  it("conta so do Google nao tem senha para trocar", async () => {
    const user = await createUser({ password: null });
    await actAs(user);
    expect((await change("qualquer")).message).toMatch(/entra pelo Google/);
  });

  it("senha atual errada: erro no campo e nada muda", async () => {
    const user = await createUser();
    await actAs(user);
    expect((await change("Errada@1")).fieldErrors).toEqual({ currentPassword: "Senha atual incorreta." });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toBe(user.passwordHash);
  });

  it("senha nova igual a atual e recusada", async () => {
    const user = await createUser();
    await actAs(user);
    expect((await change(DEFAULT_PASSWORD, DEFAULT_PASSWORD)).fieldErrors?.newPassword).toMatch(/diferente da atual/);
  });

  it("troca a senha, derruba as outras sessoes e abre uma familia nova neste aparelho", async () => {
    const user = await createUser();
    await actAs(user);
    const other = await issueRefreshToken(user.id, { persistent: true });
    const mine = await issueRefreshToken(user.id, { persistent: false });
    setCookie(REFRESH_COOKIE_NAME, mine);
    const pending = await issuePasswordResetToken(user.id);

    const state = await change(DEFAULT_PASSWORD);
    expect(state.ok).toBe(true);

    const old = await prisma.refreshToken.findMany({ where: { userId: user.id, revokedAt: { not: null } } });
    expect(old).toHaveLength(2);
    expect(old.every((row) => row.revokedReason === "PASSWORD_CHANGED")).toBe(true);
    expect(other).toBeTruthy();

    // uma familia nova, mantendo a escolha de "nao manter login"
    const fresh = await prisma.refreshToken.findMany({ where: { userId: user.id, revokedAt: null } });
    expect(fresh).toHaveLength(1);
    expect(fresh[0].persistent).toBe(false);
    expect(cookieWrites().map((c) => c.name)).toEqual([ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME]);

    // o link de redefinicao pendente foi invalidado
    expect((await prisma.passwordResetToken.findUniqueOrThrow({ where: { tokenHash: hashResetToken(pending) } })).usedAt).not.toBeNull();

    // a senha nova vale; a antiga nao
    asVisitor();
    await redirectOf(loginAction({}, formData({ username: user.username, password: NEW_PASSWORD })));
    expect(await loginAction({}, formData({ username: user.username, password: DEFAULT_PASSWORD }))).toEqual({
      message: "Usuário ou senha não conferem.",
    });
    expect(await prisma.auditLog.count({ where: { action: "PASSWORD_CHANGED" } })).toBe(1);
  });

  it("avisa por e-mail depois da resposta", async () => {
    const user = await createUser();
    await actAs(user);
    await change(DEFAULT_PASSWORD);
    expect(mailbox).toHaveLength(0);
    await flushAfter();
    expect(mailbox).toHaveLength(1);
    expect(mailbox[0].to).toBe(user.email);
    expect(mailbox[0].subject).toBe("Sua senha foi alterada");
  });

  it("5 falhas seguidas bloqueiam a conta por um tempo", async () => {
    const user = await createUser();
    await actAs(user);
    for (let i = 0; i < 5; i++) await change("Errada@1");
    expect((await change(DEFAULT_PASSWORD)).message).toMatch(/Muitas tentativas/);
  });
});

describe("forgotPasswordAction", () => {
  const forgot = (email: string) => forgotPasswordAction({}, formData({ email }));

  it("e-mail inexistente: mesma resposta e nenhum e-mail", async () => {
    const state = await forgot("ninguem@teste.com");
    expect(state.ok).toBe(true);
    expect(state.message).toMatch(/Se existir uma conta/);
    await flushAfter();
    expect(mailbox).toHaveLength(0);
  });

  it("e-mail existente: um e-mail com o link, e o banco guarda so o hash", async () => {
    const user = await createUser({ email: "gabriel@teste.com" });
    const state = await forgot("Gabriel@Teste.com");
    expect(state.ok).toBe(true);
    expect(mailbox).toHaveLength(0); // roda em after(), depois da resposta
    await flushAfter();
    expect(mailbox).toHaveLength(1);
    expect(mailbox[0].to).toBe("gabriel@teste.com");

    const link = lastResetLink()!;
    const token = new URL(link).searchParams.get("token")!;
    expect(link.startsWith("http://localhost:3100/reset-password?token=")).toBe(true);
    const rows = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashResetToken(token));
    expect(rows[0].tokenHash).not.toBe(token);
  });

  it("conta so do Google, inativa: resposta igual e nenhum e-mail", async () => {
    await createUser({ email: "google@teste.com", password: null });
    await createUser({ email: "inativo@teste.com", active: false });
    await forgot("google@teste.com");
    await forgot("inativo@teste.com");
    await flushAfter();
    expect(mailbox).toHaveLength(0);
  });

  it("limite por e-mail: a partir do 4o pedido nao sai e-mail, mas a resposta continua a mesma", async () => {
    // E-mail so deste teste: o limitador por e-mail vive em memoria durante o arquivo todo.
    await createUser({ email: "limite@teste.com" });
    for (let i = 0; i < 4; i++) {
      expect((await forgot("limite@teste.com")).ok).toBe(true);
      await flushAfter();
    }
    expect(mailbox).toHaveLength(3);
  });

  it("limite por IP: o 6o pedido recebe aviso de excesso", async () => {
    for (let i = 0; i < 5; i++) await forgot(`x${i}@teste.com`);
    expect((await forgot("x6@teste.com")).message).toMatch(/Muitas tentativas/);
  });

  it("e-mail invalido devolve erro de campo", async () => {
    expect((await forgot("nao-e-email")).fieldErrors?.email).toBeTruthy();
  });
});

describe("resetPasswordAction", () => {
  const reset = (token: string, password = NEW_PASSWORD, confirm = password) =>
    resetPasswordAction({}, formData({ token, password, passwordConfirm: confirm }));

  it("link valido troca a senha, derruba as sessoes e redireciona para o login", async () => {
    const user = await createUser();
    await issueRefreshToken(user.id, { persistent: true });
    const token = await issuePasswordResetToken(user.id);

    expect(await redirectOf(reset(token))).toBe("/login?senha=redefinida");

    expect((await prisma.refreshToken.findFirstOrThrow({ where: { userId: user.id } })).revokedReason).toBe("PASSWORD_RESET");
    await redirectOf(loginAction({}, formData({ username: user.username, password: NEW_PASSWORD })));
    await flushAfter();
    expect(mailbox.at(-1)?.subject).toBe("Sua senha foi alterada");
    expect(await prisma.auditLog.count({ where: { action: "PASSWORD_RESET" } })).toBe(1);
  });

  it("link usado de novo e recusado", async () => {
    const user = await createUser();
    const token = await issuePasswordResetToken(user.id);
    await redirectOf(reset(token));
    expect((await reset(token, "Outra@Senha2")).message).toBe("Este link é inválido ou expirou. Peça um novo.");
  });

  it("link vencido e recusado com a mesma mensagem", async () => {
    const user = await createUser();
    const token = await issuePasswordResetToken(user.id);
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await reset(token)).message).toBe("Este link é inválido ou expirou. Peça um novo.");
  });

  it("token inexistente e recusado", async () => {
    expect((await reset("x".repeat(43))).message).toBe("Este link é inválido ou expirou. Peça um novo.");
  });

  it("um link novo aposenta o anterior", async () => {
    const user = await createUser();
    const first = await issuePasswordResetToken(user.id);
    await issuePasswordResetToken(user.id);
    expect((await reset(first)).message).toBe("Este link é inválido ou expirou. Peça um novo.");
  });

  it("senha fraca devolve erro de campo e nao consome o link", async () => {
    const user = await createUser();
    const token = await issuePasswordResetToken(user.id);
    expect((await reset(token, "fraca")).fieldErrors?.password).toBeTruthy();
    expect(await redirectOf(reset(token))).toBe("/login?senha=redefinida");
  });

  it("limite por IP: o 11o envio e bloqueado", async () => {
    for (let i = 0; i < 10; i++) await reset("y".repeat(43));
    expect((await reset("y".repeat(43))).message).toMatch(/Muitas tentativas/);
  });
});
