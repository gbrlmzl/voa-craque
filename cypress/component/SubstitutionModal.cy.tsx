import { SubstitutionModal } from "@/components/live/SubstitutionModal";
import type { LiveBenchPlayer, LiveMatch, LivePlayer } from "@/services/live";
import { ADMIN } from "../support/component";

const player = (id: string, name: string, isKeeper = false): LivePlayer => ({ userId: id, name, nickname: null, photoUrl: null, isKeeper, goals: 0, assists: 0 });
const side = (id: string, name: string, base: string) => ({
  id,
  name,
  averageStrength: 50,
  roster: ["1", "2", "3", "4"].map((n) => `${base}${n}`),
  players: [player(`${base}1`, `${name} Goleiro`, true), player(`${base}2`, `${name} Ala`), player(`${base}3`, `${name} Fixo`), player(`${base}4`, `${name} Pivo`)],
});
const bench = (id: string, name: string, extra: Partial<LiveBenchPlayer> = {}) =>
  ({ userId: id, name, nickname: null, photoUrl: null, origin: "RESERVE", rosterTeamId: null, leftTeamId: null, ...extra }) as LiveBenchPlayer;

const match = {
  id: "m1",
  orderIndex: 1,
  status: "RUNNING",
  homeScore: 0,
  awayScore: 0,
  durationMs: 600_000,
  remainingMs: 300_000,
  home: side("tA", "A", "a"),
  away: side("tB", "B", "b"),
  events: [],
  substitutions: [],
  bench: Array.from({ length: 6 }, (_, i) => bench(`r${i + 1}`, `Reserva ${i + 1}`)).concat(bench("c1", "C Ala", { origin: "QUEUE", rosterTeamId: "tC" })),
} as unknown as LiveMatch;

function mountModal(onConfirm = cy.stub().as("confirmar"), onCancel = cy.stub().as("cancelar")) {
  cy.mount(<SubstitutionModal team={match.home} match={match} queue={[{ id: "tC", name: "C" }]} busy={false} onConfirm={onConfirm} onCancel={onCancel} />, { user: ADMIN });
}

describe("SubstitutionModal (fluxo de varios passos em tela pequena)", () => {
  it("escolher quem sai, quem entra e confirmar entrega a selecao", () => {
    mountModal();
    cy.findByRole("button", { name: "Confirmar substituição" }).should("be.disabled");
    cy.findByRole("button", { name: /A Ala/ }).click();
    cy.findByRole("button", { name: /Reserva 3/ }).scrollIntoView().click();
    cy.findByRole("button", { name: "Confirmar substituição" }).should("be.enabled").click();
    cy.get("@confirmar").should("have.been.calledWith", { outUserId: "a2", inUserId: "r3", permanent: false });
  });

  it("o resumo 'Sai' e 'Entra' mostra as escolhas", () => {
    mountModal();
    cy.findByRole("button", { name: /A Fixo/ }).click();
    cy.findByRole("button", { name: /Reserva 1/ }).scrollIntoView().click();
    cy.contains("p", "Sai").parent().should("contain.text", "A Fixo");
    cy.contains("p", "Entra").parent().should("contain.text", "Reserva 1");
  });

  it("a folha cabe na tela de 390x844 e o contador de jogadores rola por dentro, sem rolar a pagina", () => {
    mountModal();
    cy.findByRole("dialog").then(($dialog) => {
      const card = $dialog.children().first()[0].getBoundingClientRect();
      expect(card.height).to.be.at.most(Cypress.config("viewportHeight"));
      expect(card.width).to.be.at.most(Cypress.config("viewportWidth"));
    });
    cy.findByRole("button", { name: "Confirmar substituição" }).should("be.visible");
    cy.findByRole("button", { name: "Cancelar" }).should("be.visible");
  });

  it("em tela baixa o botao de confirmar continua visivel (a lista rola, o rodape nao)", () => {
    cy.viewport(360, 520);
    mountModal();
    cy.findByRole("button", { name: "Confirmar substituição" }).should("be.visible");
    cy.findByRole("button", { name: /Reserva 6/ }).scrollIntoView().should("be.visible");
    cy.findByRole("button", { name: "Confirmar substituição" }).should("be.visible");
  });

  it("cancelar avisa e nao confirma; ate o fim da pelada vira permanente", () => {
    mountModal();
    cy.findByRole("button", { name: /A Ala/ }).click();
    cy.findByRole("button", { name: /Reserva 2/ }).scrollIntoView().click();
    cy.findByRole("radio", { name: /Até o fim da pelada/ }).click();
    cy.findByRole("button", { name: "Confirmar substituição" }).click();
    cy.get("@confirmar").should("have.been.calledWith", { outUserId: "a2", inUserId: "r2", permanent: true });
    cy.findByRole("button", { name: "Cancelar" }).click();
    cy.get("@cancelar").should("have.been.calledOnce");
  });
});
