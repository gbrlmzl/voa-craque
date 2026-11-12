import { registerAction } from "@/actions/auth";
import { prisma } from "@/lib/prisma";
import { formData, redirectOf } from "../../helpers/actions";
import { createUser } from "../../helpers/factories";
import { cookieWrites } from "../../helpers/session";

const valid = {
  username: "Novo.Jogador",
  email: "Novo@Teste.com",
  password: "Senha@123",
  passwordConfirm: "Senha@123",
};

describe("registerAction", () => {
  it("cria usuario, sessao persistente e vai para o onboarding com o proximo", async () => {
    const destination = await redirectOf(registerAction({}, formData({ ...valid, proximo: "/game-days/abc" })));
    expect(destination).toBe("/onboarding?proximo=%2Fgame-days%2Fabc");

    const user = await prisma.user.findUniqueOrThrow({ where: { username: "novo.jogador" } });
    expect(user.email).toBe("novo@teste.com");
    expect(user.role).toBe("USER");
    expect(user.passwordHash).not.toBe("Senha@123");
    expect(cookieWrites()).toHaveLength(2);
    expect((await prisma.refreshToken.findFirstOrThrow({ where: { userId: user.id } })).persistent).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "USER_CREATED", entityId: user.id } })).toBe(1);
  });

  it("sem proximo vai para /onboarding", async () => {
    expect(await redirectOf(registerAction({}, formData(valid)))).toBe("/onboarding");
  });

  it("e-mail repetido", async () => {
    await createUser({ email: "novo@teste.com" });
    const state = await registerAction({}, formData(valid));
    expect(state.fieldErrors).toEqual({ email: "Já existe uma conta com este e-mail." });
    expect(cookieWrites()).toHaveLength(0);
  });

  it("username repetido", async () => {
    await createUser({ username: "novo.jogador" });
    const state = await registerAction({}, formData(valid));
    expect(state.fieldErrors).toEqual({ username: "Este nome de usuário já está em uso." });
  });

  it.each([
    ["curta", "Ab@1", "length"],
    ["sem maiuscula", "senha@123", "uppercase"],
    ["sem numero ou simbolo", "SenhaSenha", "numberOrSymbol"],
  ])("senha fraca (%s)", async (_label, password) => {
    const state = await registerAction({}, formData({ ...valid, password, passwordConfirm: password }));
    expect(state.fieldErrors?.password).toBeTruthy();
    expect(await prisma.user.count()).toBe(0);
  });

  it("confirmacao diferente", async () => {
    const state = await registerAction({}, formData({ ...valid, passwordConfirm: "Outra@123" }));
    expect(state.fieldErrors?.passwordConfirm).toBeTruthy();
  });

  it("a 11a tentativa valida do mesmo IP e bloqueada", async () => {
    for (let i = 0; i < 10; i++) {
      await redirectOf(
        registerAction(
          {},
          formData({ ...valid, username: `novo${i}`, email: `novo${i}@teste.com` }),
        ),
      );
    }
    const blocked = await registerAction({}, formData({ ...valid, username: "extra", email: "extra@teste.com" }));
    expect(blocked.message).toMatch(/Muitos cadastros a partir desta rede/);
    expect(await prisma.user.count({ where: { username: "extra" } })).toBe(0);
  });
});
