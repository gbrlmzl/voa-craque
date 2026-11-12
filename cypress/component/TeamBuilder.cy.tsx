import { TeamBuilder, type BuilderPlayer, type BuilderTeam } from "@/components/gameday/TeamBuilder";
import { ADMIN } from "../support/component";

const pool: BuilderPlayer[] = Array.from({ length: 8 }, (_, i) => ({
  userId: `u${i + 1}`,
  name: `Jogador ${i + 1}`,
  photoUrl: null,
  stars: 3,
  positionLabel: "Ala",
  isKeeper: i === 0,
  paymentStatus: "CONFIRMED",
}));
const teams: BuilderTeam[] = [
  { name: "A", averageStrength: 52.3, playerIds: pool.slice(0, 4).map((p) => p.userId) },
  { name: "B", averageStrength: 51.9, playerIds: pool.slice(4).map((p) => p.userId) },
];

const mountBuilder = () => cy.mount(<TeamBuilder gameDayId="g1" teamSize={4} pool={pool} teams={teams} reserveIds={[]} locked={false} />, { user: ADMIN });

describe("TeamBuilder (ponteiro e layout reais)", () => {
  it("mover um jogador para a reserva atualiza as contagens e libera o botao de salvar", () => {
    mountBuilder();
    cy.findByRole("button", { name: /Salvar escalação/ }).should("be.disabled");
    cy.findByLabelText("Time de Jogador 1").select("Reserva");
    cy.findByText("A: 3/4").should("be.visible");
    cy.findByText("Reserva: 1").should("be.visible");
    cy.findByRole("button", { name: /Salvar escalação/ }).should("be.enabled");
  });

  it("passar do limite do time avisa e bloqueia o salvamento", () => {
    mountBuilder();
    cy.findByLabelText("Time de Jogador 5").select("Time A");
    cy.findByText("A: 5/4").should("be.visible");
    cy.findByText(/Time A passou de 4 jogadores/).should("be.visible");
    cy.findByRole("button", { name: /Salvar escalação/ }).should("be.disabled");
    cy.findByLabelText("Time de Jogador 5").select("Time B");
    cy.findByRole("button", { name: /Salvar escalação/ }).should("be.disabled"); // voltou ao inicial: nada a salvar
    cy.findByText(/passou de/).should("not.exist");
  });

  it("salvar envia a escalacao e o servidor recebe os jogadores de cada time", () => {
    cy.intercept("PUT", "/api/game-days/g1/teams", { body: { ok: true } }).as("salvar");
    mountBuilder();
    cy.findByLabelText("Time de Jogador 1").select("Reserva");
    cy.findByRole("button", { name: /Salvar escalação/ }).click();
    cy.wait("@salvar").its("request.body").should("deep.equal", {
      teams: [
        { name: "A", playerIds: ["u2", "u3", "u4"] },
        { name: "B", playerIds: ["u5", "u6", "u7", "u8"] },
      ],
      reserveIds: ["u1"],
    });
    cy.findByRole("status").should("contain.text", "Times salvos.");
  });

  it("em tela de celular a lista de jogadores nao estoura a largura", () => {
    mountBuilder();
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(Cypress.config("viewportWidth"));
    });
    cy.findByLabelText("Time de Jogador 8").scrollIntoView().should("be.visible");
  });
});
