import { describe, expect, it } from "vitest";
import { checkAdminRegistration, checkAdminRemoval, remainingSlots } from "@/lib/admin-registration";

function errorOf(result: { ok: boolean; error?: string }): string {
  if (result.ok) throw new Error("expected an error");
  return result.error!;
}

describe("checkAdminRegistration", () => {
  it("allows open games and does not mark players as reserves", () => {
    expect(checkAdminRegistration({ status: "OPEN", matchStarted: false, registeredCount: 19, maxPlayers: 20, selectedCount: 1 })).toEqual({ ok: true, asReserve: false });
  });

  it("marks TEAMS_SET and LIVE registrations as reserves", () => {
    for (const status of ["TEAMS_SET", "LIVE"] as const) {
      expect(checkAdminRegistration({ status, matchStarted: status === "LIVE", registeredCount: 10, maxPlayers: 20, selectedCount: 1 })).toEqual({ ok: true, asReserve: true });
    }
  });

  it("rejects invalid selections and finished games", () => {
    expect(checkAdminRegistration({ status: "OPEN", matchStarted: false, registeredCount: 1, maxPlayers: 20, selectedCount: 0 })).toEqual({ ok: false, error: "Escolha pelo menos um jogador." });
    expect(checkAdminRegistration({ status: "FINISHED", matchStarted: false, registeredCount: 1, maxPlayers: 20, selectedCount: 1 })).toEqual({ ok: false, error: "Esta pelada já foi encerrada." });
  });

  it("enforces the registration limit", () => {
    expect(errorOf(checkAdminRegistration({ status: "OPEN", matchStarted: false, registeredCount: 20, maxPlayers: 20, selectedCount: 1 }))).toContain("lotada");
    expect(errorOf(checkAdminRegistration({ status: "OPEN", matchStarted: false, registeredCount: 18, maxPlayers: 20, selectedCount: 3 }))).toContain("Só cabem mais 2 jogadores");
    expect(errorOf(checkAdminRegistration({ status: "OPEN", matchStarted: false, registeredCount: 19, maxPlayers: 20, selectedCount: 2 }))).toContain("Só cabe mais 1 jogador");
    expect(checkAdminRegistration({ status: "OPEN", matchStarted: false, registeredCount: 18, maxPlayers: 20, selectedCount: 2 })).toEqual({ ok: true, asReserve: false });
  });
});

describe("admin registration removal", () => {
  const base = { status: "OPEN" as const, playerName: "Léo", inTeam: false, hasPlayed: false };
  it("allows free registrations", () => expect(checkAdminRemoval(base)).toEqual({ ok: true }));
  it("prioritizes played matches over team membership", () => {
    expect(errorOf(checkAdminRemoval({ ...base, inTeam: true, hasPlayed: true }))).toContain("já jogou");
    expect(errorOf(checkAdminRemoval({ ...base, inTeam: true }))).toContain("Refazer times");
    expect(errorOf(checkAdminRemoval({ ...base, status: "FINISHED" }))).toContain("encerrada");
  });
  it("never returns negative slots", () => expect(remainingSlots(22, 20)).toBe(0));
});
