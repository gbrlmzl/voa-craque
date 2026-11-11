describe("Inscricao do jogador", () => {
  let gameDayId: string;

  context("pelada aberta", () => {
    beforeEach(() => {
      cy.cenario("pelada-aberta").then((resultado) => {
        gameDayId = resultado.gameDayId!;
      });
    });

    it("inscrever no local fica aguardando o organizador confirmar", () => {
      cy.entrarComo("jogador10");
      cy.visit(`/game-days/${gameDayId}`);
      cy.findByRole("button", { name: "Pago no local" }).click();
      cy.findByRole("button", { name: "Confirmar inscrição" }).click();
      cy.findByRole("status").should("contain.text", "Inscrição feita");
      cy.contains("Sua inscrição").should("be.visible");
      cy.contains("Aguardando").should("be.visible");
      cy.contains("7/10").should("be.visible");
    });

    it("inscrever com PIX anexando o comprovante", () => {
      cy.entrarComo("jogador11");
      cy.visit(`/game-days/${gameDayId}`);
      cy.findByRole("button", { name: /Anexar comprovante/ }).should("be.visible");
      cy.get('input[type="file"]').selectFile("tests/helpers/fixtures/comprovante.png", { force: true });
      cy.findByRole("dialog", { name: "Seu comprovante" }).findByRole("button", { name: /Confirmar/ }).click();
      cy.findByText("comprovante.png").should("be.visible");
      cy.findByRole("button", { name: "Confirmar inscrição" }).click();
      cy.findByRole("status").should("contain.text", "Inscrição feita");
      cy.findByRole("button", { name: /Ver meu comprovante/ }).click();
      cy.findByRole("img", { name: "Meu comprovante" }).should("be.visible");
    });

    it("PIX sem comprovante nao inscreve", () => {
      cy.entrarComo("jogador11");
      cy.visit(`/game-days/${gameDayId}`);
      cy.findByRole("button", { name: "Confirmar inscrição" }).click();
      cy.contains("Anexe o comprovante do PIX.").should("be.visible");
      cy.contains("Sua inscrição").should("not.exist");
    });

    it("cancelar a inscricao libera a vaga", () => {
      cy.entrarComo("jogador01");
      cy.visit(`/game-days/${gameDayId}`);
      cy.contains("Sua inscrição").should("be.visible");
      cy.findByRole("button", { name: "Cancelar inscrição" }).click();
      cy.findByRole("status").should("contain.text", "Inscrição cancelada.");
      cy.findByRole("button", { name: "Confirmar inscrição" }).should("be.visible");
      cy.contains("5/10").should("be.visible");
    });
  });

  context("pelada lotada", () => {
    it("nao deixa inscrever alem do limite", () => {
      cy.cenario("pelada-lotada").then((resultado) => {
        cy.entrarComo("jogador12");
        cy.visit(`/game-days/${resultado.gameDayId}`);
        cy.contains("A pelada já bateu o limite de jogadores.").should("be.visible");
        cy.findByRole("button", { name: "Confirmar inscrição" }).should("be.disabled");
      });
    });
  });
});
