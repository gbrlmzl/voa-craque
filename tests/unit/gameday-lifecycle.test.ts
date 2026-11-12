import {
  type GameDayStatusName,
  canCancel,
  canFinish,
  canStart,
  canWatchLive,
  isClosed,
  teamsLocked,
} from "../../src/lib/gameday-lifecycle";

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

describe("canCancel e canFinish", () => {
  it("cancelar enquanto nenhuma partida comecou, em OPEN, TEAMS_SET e LIVE", () => {
    for (const status of ["OPEN", "TEAMS_SET", "LIVE"] as const) {
      expect(canCancel({ status, matchStarted: false })).toBe(true);
      expect(canCancel({ status, matchStarted: true })).toBe(false);
    }
  });

  it("encerrada e cancelada nao cancelam de novo", () => {
    for (const status of ["FINISHED", "CANCELED"] as const) {
      expect(canCancel({ status, matchStarted: false })).toBe(false);
      expect(canCancel({ status, matchStarted: true })).toBe(false);
    }
  });

  it("encerrar so com a pelada LIVE e o primeiro apito dado", () => {
    expect(canFinish({ status: "LIVE", matchStarted: true })).toBe(true);
    expect(canFinish({ status: "LIVE", matchStarted: false })).toBe(false);
    for (const status of ["OPEN", "TEAMS_SET", "FINISHED", "CANCELED"] as const) {
      expect(canFinish({ status, matchStarted: true })).toBe(false);
      expect(canFinish({ status, matchStarted: false })).toBe(false);
    }
  });

  it("nunca os dois ao mesmo tempo, em nenhuma combinacao", () => {
    for (const status of STATUSES) {
      for (const matchStarted of [false, true]) {
        const phase = { status, matchStarted };
        expect(canCancel(phase) && canFinish(phase)).toBe(false);
      }
    }
  });

  it("a pelada LIVE aberta sempre tem uma saida: cancelar ou encerrar", () => {
    for (const matchStarted of [false, true]) {
      const phase = { status: "LIVE" as const, matchStarted };
      expect(canCancel(phase) || canFinish(phase)).toBe(true);
    }
  });
});
