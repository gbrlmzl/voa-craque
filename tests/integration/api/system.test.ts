import { PATCH } from "@/app/api/system/route";
import { prisma } from "@/lib/prisma";
import { callRoute } from "../../helpers/route";
import { createAdmin, createSuperadmin, ensureSettings } from "../../helpers/factories";
import { actAs } from "../../helpers/session";

const body = {
  publicAccessEnabled: true,
  privateSiteEnabled: false,
  registrationOpen: true,
  maintenanceMessage: "Voltamos ja.",
};
const save = (input: object = body) => callRoute(PATCH, { method: "PATCH", body: input });

describe("PATCH /api/system", () => {
  it("so o superadmin: organizador recebe 403", async () => {
    await actAs(await createAdmin());
    expect((await save()).status).toBe(403);
  });

  it("grava as chaves e registra o resumo da mudanca", async () => {
    const superadmin = await createSuperadmin();
    await actAs(superadmin);
    expect((await save({ ...body, privateSiteEnabled: true })).status).toBe(200);
    const row = await prisma.systemSetting.findUniqueOrThrow({ where: { id: "global" } });
    expect(row).toMatchObject({ privateSiteEnabled: true, maintenanceMessage: "Voltamos ja.", updatedById: superadmin.id });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "SYSTEM_SETTINGS_UPDATED" } });
    // O guarda de sessao ja criou a linha global (padroes) antes do PATCH.
    expect(audit.summary).toBe("Site privado ligado");
  });

  it("sem nenhuma chave diferente, o resumo diz que nada mudou", async () => {
    await ensureSettings();
    await actAs(await createSuperadmin());
    await save();
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "SYSTEM_SETTINGS_UPDATED" } });
    expect(audit.summary).toBe("Configuração salva sem alterações");
  });

  it("as tres chaves: o resumo diz o que mudou", async () => {
    await ensureSettings();
    await actAs(await createSuperadmin());
    await save({ ...body, publicAccessEnabled: false, privateSiteEnabled: true, registrationOpen: false });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "SYSTEM_SETTINGS_UPDATED" } });
    expect(audit.summary).toBe("Site em manutenção · Site privado ligado · Inscrições fechadas");
    expect(audit.before).toMatchObject({ publicAccessEnabled: true });
    expect(audit.after).toMatchObject({ publicAccessEnabled: false });
  });

  it("mensagem curta demais ou chave que nao e booleano: 422", async () => {
    await actAs(await createSuperadmin());
    expect((await save({ ...body, maintenanceMessage: "ab" })).status).toBe(422);
    expect((await save({ ...body, registrationOpen: "sim" })).status).toBe(422);
  });
});
