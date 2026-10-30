import { describe, expect, it } from "vitest";
import {
  type GameDayStatusName,
  canStart,
  canWatchLive,
  isClosed,
  teamsLocked,
} from "../src/lib/gameday-lifecycle";

const STATUSES: GameDayStatusName[] = ["OPEN", "TEAMS_SET", "LIVE", "FINISHED", "CANCELED"];

describe("canStart", () => {
  it("so com os times definidos", () => {
    expect(STATUSES.filter(canStart)).toEqual(["TEAMS_SET"]);
  });
});

describe("teamsLocked", () => {
  it("OPEN e TEAMS_SET sem partida comecada deixam refazer", () => {
    expect(teamsLocked({ status: "OPEN", matchStarted: false })).toBe(false);
    expect(teamsLocked({ status: "TEAMS_SET", matchStarted: false })).toBe(false);
  });

  it("iniciar a pelada (LIVE) trava os times mesmo antes do primeiro apito", () => {
    expect(teamsLocked({ status: "LIVE", matchStarted: false })).toBe(true);
    expect(teamsLocked({ status: "LIVE", matchStarted: true })).toBe(true);
  });

  it("encerrada e cancelada travam", () => {
    for (const status of ["FINISHED", "CANCELED"] as const) {
      expect(teamsLocked({ status, matchStarted: false })).toBe(true);
      expect(teamsLocked({ status, matchStarted: true })).toBe(true);
    }
  });

  it("partida fora de SCHEDULED trava em qualquer status", () => {
    for (const status of STATUSES) {
      expect(teamsLocked({ status, matchStarted: true })).toBe(true);
    }
  });
});

describe("isClosed", () => {
  it("encerrada e cancelada", () => {
    expect(STATUSES.filter(isClosed)).toEqual(["FINISHED", "CANCELED"]);
  });
});

describe("canWatchLive", () => {
  it("painel e tela ao vivo so depois de iniciada (e depois de encerrada)", () => {
    expect(STATUSES.filter(canWatchLive)).toEqual(["LIVE", "FINISHED"]);
  });
});
