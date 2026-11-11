describe("Times: sortear, ajustar e iniciar a pelada", () => {
  it("sorteia, refaz, move um jogador para a reserva e inicia a pelada", () => {
    cy.cenario("pelada-aberta").then(({ gameDayId }) => {
      cy.task("sql", `select id from "User" where username in ('jogador07','jogador08') order by username`).then((rows) => {
        cy.entrarComo("organizador");
        cy.request("POST", `/api/game-days/${gameDayId}/registrations/admin`, {
          userIds: (rows as { id: string }[]).map((row) => row.id),
          paymentMethod: "ON_SITE",
          alreadyPaid: true,
        }).its("status").should("eq", 200);
      });

      cy.visit(`/game-days/${gameDayId}/teams`);
      cy.contains("8 jogadores inscritos").should("be.visible");
      cy.findByRole("button", { name: /Sortear times/ }).click();
      cy.findByRole("status").should("contain.text", "2 times sorteados.");
      cy.contains("2 times montados").should("be.visible");

      cy.findByRole("button", { name: /Sortear de novo/ }).click();
      cy.findByRole("status").should("contain.text", "2 times sorteados.");

      cy.findByLabelText("Time de Jogador 01").select("Reserva");
      cy.findByRole("button", { name: /Salvar escalação/ }).click();
      cy.findByRole("status").should("contain.text", "Times salvos.");
      cy.contains("Reserva: 1").should("be.visible");

      cy.visit(`/game-days/${gameDayId}`);
      cy.contains("Times definidos").should("be.visible");
      cy.findByRole("button", { name: /Iniciar pelada/ }).click();
      cy.findByRole("dialog", { name: "Iniciar pelada?" }).findByRole("button", { name: "Iniciar" }).click();
      cy.location("pathname").should("eq", `/game-days/${gameDayId}/panel`);
      cy.findByRole("button", { name: /Iniciar partida/ }).should("be.visible");
    });
  });

  it("menos de dois times completos: o sorteio fica desabilitado", () => {
    cy.cenario("pelada-aberta").then(({ gameDayId }) => {
      cy.entrarComo("organizador");
      cy.visit(`/game-days/${gameDayId}/teams`);
      cy.findByRole("button", { name: /Sortear times/ }).should("be.disabled");
      cy.contains("São necessários 8 inscritos para formar dois times.").should("be.visible");
    });
  });
});
