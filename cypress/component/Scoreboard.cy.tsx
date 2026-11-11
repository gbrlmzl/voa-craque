import { useState } from "react";
import { Scoreboard } from "@/components/live/Scoreboard";
import type { LiveMatch } from "@/services/live";

const base = {
  id: "m1",
  orderIndex: 1,
  status: "RUNNING",
  homeScore: 1,
  awayScore: 0,
  durationMs: 600_000,
  remainingMs: 599_000,
  home: { id: "tA", name: "A", averageStrength: 50, roster: [], players: [] },
  away: { id: "tB", name: "B", averageStrength: 50, roster: [], players: [] },
  events: [],
  substitutions: [],
  bench: [],
} as unknown as LiveMatch;

function Harness() {
  const [state, setState] = useState({ home: 1, away: 0, remainingMs: 599_000, status: "RUNNING" });
  return (
    <>
      <button onClick={() => setState({ home: 11, away: 10, remainingMs: 61_000, status: "PAUSED" })}>Mudar</button>
      <button onClick={() => setState({ home: 1, away: 0, remainingMs: 599_000, status: "RUNNING" })}>Voltar</button>
      <div data-cy="placar">
        <Scoreboard match={{ ...base, homeScore: state.home, awayScore: state.away, status: state.status as never }} remainingMs={state.remainingMs} goalsToWin={2} streaming />
      </div>
    </>
  );
}

const columns = () =>
  cy.get("[data-cy=placar] .grid").then(($grid) => Array.from($grid.children()).map((el) => el.getBoundingClientRect()));

describe("Scoreboard (layout dos digitos fixos)", () => {
  it("as tres colunas nao mudam de largura nem de posicao quando placar, relogio e estado mudam", () => {
    cy.mount(<Harness />);
    let before: DOMRect[] = [];
    columns().then((rects) => (before = rects));
    cy.findByRole("button", { name: "Mudar" }).click();
    cy.findByText("Pausada").should("be.visible");
    columns().then((after) => {
      expect(after).to.have.length(3);
      after.forEach((rect, i) => {
        expect(Math.round(rect.left), `coluna ${i} left`).to.equal(Math.round(before[i].left));
        expect(Math.round(rect.width), `coluna ${i} width`).to.equal(Math.round(before[i].width));
      });
    });
  });

  it("cada digito ocupa a mesma largura (1 nao e mais estreito que 0)", () => {
    cy.mount(<Harness />);
    const digits = (column: number) =>
      cy.get(`[data-cy=placar] .grid > div:nth-child(${column}) [aria-hidden] > span`).then(($spans) => Array.from($spans).map((el) => Math.round(el.getBoundingClientRect().width)));
    let oneDigit = 0;
    digits(1).then((widths) => (oneDigit = widths[0]));
    cy.findByRole("button", { name: "Mudar" }).click();
    digits(1).should((widths) => {
      expect(widths).to.have.length(2);
      widths.forEach((width) => expect(width).to.equal(oneDigit));
    });
    digits(3).should((widths) => {
      expect(widths).to.have.length(2); // "10": o 1 e o 0 com a mesma largura
      expect(widths[0]).to.equal(widths[1]);
    });
  });

  it("em 390 px o placar nao rola para os lados", () => {
    cy.mount(<Harness />);
    cy.document().then((doc) => expect(doc.documentElement.scrollWidth).to.be.at.most(390));
  });

  it("no ultimo minuto o relogio fica vermelho", () => {
    cy.mount(<Scoreboard match={base} remainingMs={59_000} goalsToWin={2} streaming />);
    cy.contains("00:59").closest(".inline-flex").should("have.class", "text-rose-400");
  });
});
