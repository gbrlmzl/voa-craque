import { describe, expect, it } from "vitest";
import {
  MatchStateError,
  applyGoal,
  createClock,
  elapsedAt,
  evaluateOutcome,
  formatClock,
  pauseClock,
  remainingAt,
  resumeClock,
  revertGoal,
  rotateQueue,
  startClock,
  stopClock,
  type MatchClock,
} from "@/lib/match-engine";

const T0 = 1_700_000_000_000;
const TEN_MIN = 10 * 60 * 1000;

function runningClock(now = T0, durationMs = TEN_MIN): MatchClock {
  return startClock(createClock(durationMs), now);
}

describe("cronometro", () => {
  it("nasce parado com o tempo cheio", () => {
    const clock = createClock(TEN_MIN);
    expect(clock.status).toBe("SCHEDULED");
    expect(remainingAt(clock, T0)).toBe(TEN_MIN);
    expect(elapsedAt(clock, T0)).toBe(0);
  });

  it("recusa duracao invalida", () => {
    expect(() => createClock(0)).toThrow(MatchStateError);
    expect(() => createClock(-1)).toThrow(MatchStateError);
  });

  it("conta para tras enquanto corre", () => {
    const clock = runningClock();
    expect(remainingAt(clock, T0 + 30_000)).toBe(TEN_MIN - 30_000);
    expect(elapsedAt(clock, T0 + 30_000)).toBe(30_000);
  });

  it("congela no pause e nao anda enquanto pausado", () => {
    const pausado = pauseClock(runningClock(), T0 + 60_000);
    expect(pausado.status).toBe("PAUSED");
    expect(pausado.remainingMs).toBe(TEN_MIN - 60_000);
    expect(remainingAt(pausado, T0 + 500_000)).toBe(TEN_MIN - 60_000);
  });

  it("retoma de onde parou", () => {
    const pausado = pauseClock(runningClock(), T0 + 60_000);
    const retomado = resumeClock(pausado, T0 + 300_000);
    expect(retomado.status).toBe("RUNNING");
    expect(remainingAt(retomado, T0 + 310_000)).toBe(TEN_MIN - 70_000);
  });

  it("nunca fica negativo", () => {
    expect(remainingAt(runningClock(), T0 + TEN_MIN * 3)).toBe(0);
  });

  it("bloqueia transicoes invalidas", () => {
    const agendada = createClock(TEN_MIN);
    expect(() => pauseClock(agendada, T0)).toThrow(MatchStateError);
    expect(() => resumeClock(agendada, T0)).toThrow(MatchStateError);

    const correndo = runningClock();
    expect(() => startClock(correndo, T0)).toThrow(MatchStateError);
    expect(() => resumeClock(correndo, T0)).toThrow(MatchStateError);

    const encerrada = stopClock(correndo, T0 + 1000);
    expect(() => stopClock(encerrada, T0 + 2000)).toThrow(MatchStateError);
    expect(() => pauseClock(encerrada, T0 + 2000)).toThrow(MatchStateError);
  });

  it("nao retoma partida com o tempo zerado", () => {
    const zerada = pauseClock(runningClock(), T0 + TEN_MIN);
    expect(zerada.remainingMs).toBe(0);
    expect(() => resumeClock(zerada, T0 + TEN_MIN + 1)).toThrow(/tempo da partida já acabou/);
  });

  it("formata o relogio em mm:ss", () => {
    expect(formatClock(TEN_MIN)).toBe("10:00");
    expect(formatClock(65_000)).toBe("01:05");
    expect(formatClock(-500)).toBe("00:00");
  });
});

describe("placar", () => {
  it("soma e desfaz gols sem ficar negativo", () => {
    let score = { home: 0, away: 0 };
    score = applyGoal(score, "HOME");
    score = applyGoal(score, "AWAY");
    expect(score).toEqual({ home: 1, away: 1 });

    score = revertGoal(score, "HOME");
    expect(score).toEqual({ home: 0, away: 1 });

    expect(revertGoal(score, "HOME")).toEqual({ home: 0, away: 1 });
  });

  it("nao muda o placar ao desfazer assistencia", () => {
    const score = { home: 2, away: 1 };
    expect({ ...score }).toEqual({ home: 2, away: 1 });
  });
});

describe("evaluateOutcome", () => {
  const clock = runningClock();

  it("segue em jogo antes do numero de gols", () => {
    const outcome = evaluateOutcome({ score: { home: 1, away: 0 }, clock, now: T0 + 60_000, goalsToWin: 2 });
    expect(outcome).toEqual({ finished: false, result: null, reason: null });
  });

  it("encerra por gols quando o time chega ao alvo", () => {
    const outcome = evaluateOutcome({ score: { home: 2, away: 1 }, clock, now: T0 + 60_000, goalsToWin: 2 });
    expect(outcome).toEqual({ finished: true, result: "HOME", reason: "GOALS" });
  });

  it("reconhece a vitoria do visitante", () => {
    const outcome = evaluateOutcome({ score: { home: 0, away: 2 }, clock, now: T0 + 60_000, goalsToWin: 2 });
    expect(outcome).toEqual({ finished: true, result: "AWAY", reason: "GOALS" });
  });

  it("encerra por tempo com vitoria de quem esta na frente", () => {
    const outcome = evaluateOutcome({ score: { home: 1, away: 0 }, clock, now: T0 + TEN_MIN, goalsToWin: 2 });
    expect(outcome).toEqual({ finished: true, result: "HOME", reason: "TIME" });
  });

  it("encerra em empate quando o cronometro zera 1 x 1", () => {
    const outcome = evaluateOutcome({ score: { home: 1, away: 1 }, clock, now: T0 + TEN_MIN, goalsToWin: 2 });
    expect(outcome).toEqual({ finished: true, result: "DRAW", reason: "TIME" });
  });

  it("nao encerra por tempo uma partida que ainda nao comecou", () => {
    const outcome = evaluateOutcome({
      score: { home: 0, away: 0 },
      clock: createClock(TEN_MIN),
      now: T0 + TEN_MIN * 5,
      goalsToWin: 2,
    });
    expect(outcome.finished).toBe(false);
  });

  it("o gol vence a corrida contra o cronometro no mesmo instante", () => {
    const outcome = evaluateOutcome({ score: { home: 2, away: 0 }, clock, now: T0 + TEN_MIN, goalsToWin: 2 });
    expect(outcome.reason).toBe("GOALS");
  });

  it("desfazer o gol decisivo devolve a partida para o jogo", () => {
    const marcou = evaluateOutcome({ score: { home: 2, away: 0 }, clock, now: T0 + 10_000, goalsToWin: 2 });
    expect(marcou.finished).toBe(true);

    const desfeito = evaluateOutcome({
      score: revertGoal({ home: 2, away: 0 }, "HOME"),
      clock,
      now: T0 + 12_000,
      goalsToWin: 2,
    });
    expect(desfeito.finished).toBe(false);
  });
});

describe("rotateQueue", () => {
  it("mantem o vencedor em quadra e chama o proximo da fila", () => {
    const rot = rotateQueue({ homeTeamId: "A", awayTeamId: "B", result: "HOME", queue: ["C", "D"] });
    expect(rot.staying).toBe("A");
    expect(rot.leaving).toEqual(["B"]);
    expect(rot.nextHomeTeamId).toBe("A");
    expect(rot.nextAwayTeamId).toBe("C");
    expect(rot.queue).toEqual(["D", "B"]);
  });

  it("funciona igual quando quem vence e o time visitante", () => {
    const rot = rotateQueue({ homeTeamId: "A", awayTeamId: "B", result: "AWAY", queue: ["C", "D"] });
    expect(rot.staying).toBe("B");
    expect(rot.nextHomeTeamId).toBe("B");
    expect(rot.nextAwayTeamId).toBe("C");
    expect(rot.queue).toEqual(["D", "A"]);
  });

  it("no empate os dois saem e entram as duas proximas equipes", () => {
    const rot = rotateQueue({ homeTeamId: "A", awayTeamId: "B", result: "DRAW", queue: ["C", "D"] });
    expect(rot.staying).toBeNull();
    expect(rot.leaving).toEqual(["A", "B"]);
    expect(rot.nextHomeTeamId).toBe("C");
    expect(rot.nextAwayTeamId).toBe("D");
    expect(rot.queue).toEqual(["A", "B"]);
  });

  it("com so dois times o empate devolve os mesmos times para a proxima", () => {
    const rot = rotateQueue({ homeTeamId: "A", awayTeamId: "B", result: "DRAW", queue: [] });
    expect(rot.nextHomeTeamId).toBe("A");
    expect(rot.nextAwayTeamId).toBe("B");
    expect(rot.queue).toEqual([]);
  });

  it("com so dois times o vencedor reencontra o perdedor", () => {
    const rot = rotateQueue({ homeTeamId: "A", awayTeamId: "B", result: "HOME", queue: [] });
    expect(rot.nextHomeTeamId).toBe("A");
    expect(rot.nextAwayTeamId).toBe("B");
    expect(rot.queue).toEqual([]);
  });

  it("ignora times que ja estao em quadra caso apareçam na fila", () => {
    const rot = rotateQueue({ homeTeamId: "A", awayTeamId: "B", result: "HOME", queue: ["B", "C"] });
    expect(rot.nextAwayTeamId).toBe("C");
    expect(rot.queue).toEqual(["B"]);
  });

  it("sequencia de tres rodadas mantem a fila consistente", () => {
    let queue = ["C", "D"];
    let home = "A";
    let away = "B";

    const r1 = rotateQueue({ homeTeamId: home, awayTeamId: away, result: "HOME", queue });
    queue = r1.queue;
    home = r1.nextHomeTeamId!;
    away = r1.nextAwayTeamId!;
    expect([home, away]).toEqual(["A", "C"]);

    const r2 = rotateQueue({ homeTeamId: home, awayTeamId: away, result: "DRAW", queue });
    queue = r2.queue;
    home = r2.nextHomeTeamId!;
    away = r2.nextAwayTeamId!;
    expect([home, away]).toEqual(["D", "B"]);
    expect(queue).toEqual(["A", "C"]);

    const r3 = rotateQueue({ homeTeamId: home, awayTeamId: away, result: "AWAY", queue });
    expect([r3.nextHomeTeamId, r3.nextAwayTeamId]).toEqual(["B", "A"]);
    expect(r3.queue).toEqual(["C", "D"]);
  });
});
