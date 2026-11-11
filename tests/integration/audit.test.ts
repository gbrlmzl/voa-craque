import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { setRequestHeader } from "../helpers/next-env";
import { createAdmin, toCurrentUser } from "../helpers/factories";

describe("recordAudit", () => {
  it("grava ator, entidade, ip e user-agent da requisicao", async () => {
    const admin = await createAdmin();
    setRequestHeader("x-forwarded-for", "203.0.113.7");
    setRequestHeader("user-agent", "jest");
    await recordAudit(toCurrentUser(admin), {
      action: AUDIT_ACTIONS.GAMEDAY_CREATED,
      entity: "GameDay",
      entityId: "g1",
      summary: "Pelada de teste",
    });
    const row = await prisma.auditLog.findFirstOrThrow();
    expect(row).toMatchObject({
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: "ADMIN",
      action: "GAMEDAY_CREATED",
      entity: "GameDay",
      entityId: "g1",
      summary: "Pelada de teste",
      ip: "203.0.113.7",
      userAgent: "jest",
    });
  });

  it("antes e depois vao como JSON e nunca carregam o hash da senha", async () => {
    const admin = await createAdmin();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    await recordAudit(toCurrentUser(admin), {
      action: AUDIT_ACTIONS.USER_UPDATED,
      entity: "User",
      entityId: admin.id,
      before: { role: "USER", date: new Date("2030-01-01T00:00:00Z") },
      after: { role: "ADMIN" },
    });
    const row = await prisma.auditLog.findFirstOrThrow();
    expect(row.before).toEqual({ role: "USER", date: "2030-01-01T00:00:00.000Z" });
    expect(JSON.stringify(row)).not.toContain(user.passwordHash!);
  });

  it("sem ator (acao do sistema) e sem contexto de requisicao ainda grava", async () => {
    await recordAudit(null, { action: AUDIT_ACTIONS.MATCH_FINISHED, entity: "Match", summary: "fim" });
    const row = await prisma.auditLog.findFirstOrThrow();
    expect(row).toMatchObject({ actorId: null, actorEmail: null, actorRole: null });
  });

  it("falha ao gravar nunca derruba a operacao", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const create = jest.spyOn(prisma.auditLog, "create").mockRejectedValueOnce(new Error("banco fora"));
    await expect(recordAudit(null, { action: AUDIT_ACTIONS.MATCH_FINISHED, entity: "Match" })).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    create.mockRestore();
    spy.mockRestore();
  });
});
