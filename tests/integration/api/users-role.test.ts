import { PATCH } from "@/app/api/users/[id]/role/route";
import { prisma } from "@/lib/prisma";
import { callRoute } from "../../helpers/route";
import { createAdmin, createPlayer, createSuperadmin } from "../../helpers/factories";
import { actAs } from "../../helpers/session";

const setRole = (id: string, role: string) => callRoute(PATCH, { method: "PATCH", params: { id }, body: { role } });

describe("PATCH /api/users/[id]/role", () => {
  it("organizador nao muda papel de ninguem (403), nem jogador (403)", async () => {
    const target = await createPlayer();
    await actAs(await createAdmin());
    expect((await setRole(target.id, "ADMIN")).status).toBe(403);
    await actAs(target);
    expect((await setRole(target.id, "SUPERADMIN")).status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).role).toBe("USER");
  });

  it("superadmin promove e rebaixa, e a auditoria guarda antes e depois", async () => {
    const target = await createPlayer({ profile: { name: "Craque" } });
    await actAs(await createSuperadmin());
    expect((await setRole(target.id, "ADMIN")).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).role).toBe("ADMIN");
    await setRole(target.id, "USER");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).role).toBe("USER");
    const audits = await prisma.auditLog.findMany({ where: { action: "USER_ROLE_CHANGED" }, orderBy: { createdAt: "asc" } });
    expect(audits.map((a) => a.summary)).toEqual(["Craque: USER para ADMIN", "Craque: ADMIN para USER"]);
    expect(audits[0].before).toEqual({ role: "USER" });
    expect(audits[0].after).toEqual({ role: "ADMIN" });
  });

  it("o superadmin nao se rebaixa (409), mas pode se manter superadmin", async () => {
    const superadmin = await createSuperadmin();
    await actAs(superadmin);
    const res = await setRole(superadmin.id, "ADMIN");
    expect(res.status).toBe(409);
    expect(res.json.error).toBe("Você não pode rebaixar a própria conta.");
    expect((await setRole(superadmin.id, "SUPERADMIN")).status).toBe(200);
  });

  it("papel invalido: 422; usuario inexistente: 404", async () => {
    await actAs(await createSuperadmin());
    expect((await setRole("qualquer", "DONO")).status).toBe(422);
    expect((await setRole("fantasma", "ADMIN")).status).toBe(404);
  });
});
