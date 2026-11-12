import { decideAccess, settingsChangeSummary, type AccessDecision, type Viewer } from "@/lib/site-access";

const visitor: Viewer = null;
const player: Viewer = { role: "USER" };
const superadmin: Viewer = { role: "SUPERADMIN" };

describe("decideAccess", () => {
  it.each<[string, Viewer, boolean, boolean, AccessDecision]>([
    // viewer, publicAccessEnabled, privateSiteEnabled, decisao
    ["visitante, site liberado e aberto", visitor, true, false, "allow"],
    ["visitante, site liberado e privado", visitor, true, true, "login"],
    ["visitante, manutencao e aberto", visitor, false, false, "maintenance"],
    ["visitante, manutencao e privado", visitor, false, true, "maintenance"],
    ["jogador, site liberado e aberto", player, true, false, "allow"],
    ["jogador, site liberado e privado", player, true, true, "allow"],
    ["jogador, manutencao e aberto", player, false, false, "maintenance"],
    ["jogador, manutencao e privado", player, false, true, "maintenance"],
    ["superadmin, site liberado e aberto", superadmin, true, false, "allow"],
    ["superadmin, site liberado e privado", superadmin, true, true, "allow"],
    ["superadmin, manutencao e aberto", superadmin, false, false, "allow"],
    ["superadmin, manutencao e privado", superadmin, false, true, "allow"],
  ])("%s", (_name, viewer, publicAccessEnabled, privateSiteEnabled, expected) => {
    expect(decideAccess(viewer, { publicAccessEnabled, privateSiteEnabled })).toBe(expected);
  });

  it("organizador comum nao e superadmin: manutencao barra", () => {
    expect(decideAccess({ role: "ADMIN" }, { publicAccessEnabled: false, privateSiteEnabled: false })).toBe("maintenance");
  });
});

describe("settingsChangeSummary", () => {
  const base = { publicAccessEnabled: true, privateSiteEnabled: true, registrationOpen: true };

  it("lista cada chave que mudou", () => {
    expect(settingsChangeSummary(base, { ...base, privateSiteEnabled: false })).toBe("Site privado desligado");
    expect(settingsChangeSummary(base, { ...base, publicAccessEnabled: false, registrationOpen: false })).toBe(
      "Site em manutenção · Inscrições fechadas",
    );
    expect(settingsChangeSummary({ ...base, privateSiteEnabled: false }, base)).toBe("Site privado ligado");
  });

  it("sem mudanca", () => {
    expect(settingsChangeSummary(base, base)).toBe("Configuração salva sem alterações");
  });

  it("primeira gravacao (sem registro anterior) nao inventa mudanca", () => {
    expect(settingsChangeSummary(null, base)).toBe("Configuração salva sem alterações");
  });
});
