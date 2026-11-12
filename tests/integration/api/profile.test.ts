import { PUT } from "@/app/api/profile/route";
import { prisma } from "@/lib/prisma";
import { callRoute } from "../../helpers/route";
import { createPlayer, createUser } from "../../helpers/factories";
import { actAs, asVisitor } from "../../helpers/session";

const valid = {
  name: "Gabriel Souza",
  nickname: "Gabi",
  foot: "RIGHT",
  position: "ALA",
  age: 28,
  heightCm: 178,
  weightKg: 74,
  photoUrl: "/api/files/fotos/x.webp",
};
const save = (body: object) => callRoute(PUT, { method: "PUT", body });

describe("PUT /api/profile", () => {
  it("visitante: 401", async () => {
    asVisitor();
    expect((await save(valid)).status).toBe(401);
  });

  it("onboarding: cria o perfil completo e audita PROFILE_COMPLETED", async () => {
    const user = await createUser({ profile: false });
    await actAs(user);
    expect((await save(valid)).status).toBe(200);
    const profile = await prisma.playerProfile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(profile).toMatchObject({ name: "Gabriel Souza", nickname: "Gabi", position: "ALA", completed: true, stars: null });
    expect(await prisma.auditLog.count({ where: { action: "PROFILE_COMPLETED" } })).toBe(1);
  });

  it("edicao: atualiza, preserva as estrelas do organizador e audita PROFILE_UPDATED com antes e depois", async () => {
    const user = await createPlayer({ profile: { stars: 4, name: "Antigo" } });
    await actAs(user);
    await save({ ...valid, nickname: "", photoUrl: "" });
    const profile = await prisma.playerProfile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(profile).toMatchObject({ name: "Gabriel Souza", nickname: null, photoUrl: null, stars: 4 });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "PROFILE_UPDATED" } });
    expect((audit.before as { name: string }).name).toBe("Antigo");
    expect((audit.after as { name: string }).name).toBe("Gabriel Souza");
  });

  it("o jogador nao consegue se dar estrelas pelo corpo", async () => {
    const user = await createPlayer({ profile: { stars: 2 } });
    await actAs(user);
    await save({ ...valid, stars: 5 });
    expect((await prisma.playerProfile.findUniqueOrThrow({ where: { userId: user.id } })).stars).toBe(2);
  });

  it("dados invalidos: 422 com o erro por campo", async () => {
    await actAs(await createUser({ profile: false }));
    const res = await save({ ...valid, name: "A", age: 10, heightCm: 100, weightKg: 300, foot: "NENHUM", position: "GOLEIRO" });
    expect(res.status).toBe(422);
    expect(Object.keys(res.json.details).sort()).toEqual(["age", "foot", "heightCm", "name", "position", "weightKg"]);
    expect(res.json.details.age).toBe("Idade minima 14 anos.");
  });

  it("aceita numeros enviados como texto (formulario)", async () => {
    const user = await createUser({ profile: false });
    await actAs(user);
    expect((await save({ ...valid, age: "30", heightCm: "180", weightKg: "80" })).status).toBe(200);
  });
});
