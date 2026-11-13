import { ADMIN_LINKS, adminLinksFor } from "../../src/lib/admin-links";
import { AUDIT_ACTIONS, AUDIT_ACTION_LABEL, AUDIT_ENTITIES } from "../../src/lib/audit-actions";
import { cn } from "../../src/lib/cn";
import { NEW_GAMEDAY } from "../../src/lib/gameday-defaults";
import {
  FOOT_LABEL,
  GAMEDAY_STATUS_LABEL,
  MATCH_END_REASON_LABEL,
  MATCH_EVENT_LABEL,
  MATCH_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  POSITION_LABEL,
  ROLE_LABEL,
  formatCents,
  formatDate,
  formatDateTime,
  formatMinutes,
  formatMmr,
  formatMmrDelta,
  formatMmrPoints,
  formatPercent,
  formatStakeFactor,
  formatStars,
  teamColor,
} from "../../src/lib/labels";
import { gameDaySchema, registrationSchema } from "../../src/lib/validation";

describe("cn", () => {
  it("junta classes, ignora falsos e resolve conflitos do Tailwind (a ultima vence)", () => {
    expect(cn("p-2", false && "x", undefined, "text-sm")).toBe("p-2 text-sm");
    expect(cn("p-2 p-4", ["text-sm", { hidden: true, flex: false }])).toBe("p-4 text-sm hidden");
  });
});

describe("labels de dominio", () => {
  it("todo valor dos enums tem rotulo em portugues", () => {
    expect(Object.keys(ROLE_LABEL).sort()).toEqual(["ADMIN", "SUPERADMIN", "USER"]);
    expect(Object.keys(FOOT_LABEL).sort()).toEqual(["BOTH", "LEFT", "RIGHT"]);
    expect(Object.keys(POSITION_LABEL).sort()).toEqual(["ALA", "FIXO", "GOALKEEPER", "PIVO"]);
    expect(Object.keys(GAMEDAY_STATUS_LABEL).sort()).toEqual(["CANCELED", "FINISHED", "LIVE", "OPEN", "TEAMS_SET"]);
    expect(Object.keys(PAYMENT_METHOD_LABEL).sort()).toEqual(["ON_SITE", "PIX"]);
    expect(Object.keys(PAYMENT_STATUS_LABEL).sort()).toEqual(["CONFIRMED", "PENDING", "REJECTED"]);
    expect(Object.keys(MATCH_STATUS_LABEL).sort()).toEqual(["FINISHED", "PAUSED", "RUNNING", "SCHEDULED"]);
    expect(Object.keys(MATCH_END_REASON_LABEL).sort()).toEqual(["GOALS", "MANUAL", "TIME"]);
    expect(Object.keys(MATCH_EVENT_LABEL).sort()).toEqual(["ASSIST", "GOAL"]);
  });

  it("cor do time pela letra; desconhecido cai no neutro", () => {
    expect(teamColor("A")).not.toEqual(teamColor("B"));
    expect(teamColor("?")).toMatchObject({ dot: "bg-slate-400" });
    for (const name of ["A", "B", "C", "D", "E"]) expect(teamColor(name).chip).toMatch(/bg-/);
  });
});

describe("formatadores", () => {
  const nbsp = /\s/g;
  it("dinheiro em reais", () => {
    expect(formatCents(450).replace(nbsp, " ")).toBe("R$ 4,50");
    expect(formatCents(0).replace(nbsp, " ")).toBe("R$ 0,00");
    expect(formatCents(123456).replace(nbsp, " ")).toBe("R$ 1.234,56");
  });
  it("datas no padrao brasileiro (string ou Date)", () => {
    expect(formatDate(new Date(2030, 4, 10, 12))).toBe("10/05/2030");
    expect(formatDateTime(new Date(2030, 4, 10, 20, 5)).replace(nbsp, " ")).toMatch(/^10\/05\/2030,? 20:05$/);
    expect(formatDate("2030-05-10T15:00:00")).toBe("10/05/2030");
  });
  it("porcentagem, minutos, MMR e estrelas", () => {
    expect(formatPercent(0.666)).toBe("67%");
    expect(formatMinutes(540)).toBe("9 min");
    expect(formatMmr(1032.4)).toMatch(/^1\.?032$/);
    expect(formatStars(3)).toBe("3");
    expect(formatStars(3.5)).toBe("3,5");
  });
  it("movimento de MMR com sinal (menos de verdade, nao hifen)", () => {
    expect(formatMmrDelta(12.4)).toBe("+12");
    expect(formatMmrDelta(-7.6)).toBe("−8");
    expect(formatMmrDelta(0.2)).toBe("0");
    expect(formatMmrPoints(10.24)).toBe("+10,2");
    expect(formatMmrPoints(-2.44)).toBe("−2,4");
    expect(formatMmrPoints(0)).toBe("0,0");
  });
  it("fator de aposta", () => {
    expect(formatStakeFactor(1.3)).toBe("1,30");
    expect(formatStakeFactor(1.075)).toBe("1,075");
    expect(formatStakeFactor(1)).toBe("1,00");
  });
});

describe("gameday-defaults", () => {
  it("os padroes do formulario sao validos para o schema do servidor depois de preenchidos", () => {
    const filled = {
      title: "Pelada",
      scheduledAt: "2030-01-01T20:00",
      location: "Quadra",
      pricePerPlayerCents: Math.round(Number(NEW_GAMEDAY.price.replace(",", ".")) * 100),
      matchDurationSec: Number(NEW_GAMEDAY.durationMin) * 60,
      goalsToWin: NEW_GAMEDAY.goalsToWin,
      maxPlayers: NEW_GAMEDAY.maxPlayers,
      teamSize: NEW_GAMEDAY.teamSize,
      pixKey: "pix",
    };
    expect(gameDaySchema.safeParse(filled).success).toBe(true);
    expect(registrationSchema.safeParse({ paymentMethod: "ON_SITE" }).success).toBe(true);
  });
});

describe("admin-links", () => {
  it("organizador so ve a avaliacao de jogadores; superadmin ve tudo; jogador nada", () => {
    expect(adminLinksFor("USER")).toEqual([]);
    expect(adminLinksFor("ADMIN").map((l) => l.href)).toEqual(["/players"]);
    expect(adminLinksFor("SUPERADMIN")).toHaveLength(ADMIN_LINKS.length);
    expect(ADMIN_LINKS.every((l) => l.href.startsWith("/") && l.label && l.description)).toBe(true);
  });
});

describe("audit-actions", () => {
  it("toda acao tem rotulo e toda chave e igual ao valor", () => {
    for (const [key, value] of Object.entries(AUDIT_ACTIONS)) {
      expect(value).toBe(key);
      expect(AUDIT_ACTION_LABEL[value as keyof typeof AUDIT_ACTION_LABEL]).toBeTruthy();
    }
    expect(new Set(AUDIT_ENTITIES).size).toBe(AUDIT_ENTITIES.length);
  });
});
