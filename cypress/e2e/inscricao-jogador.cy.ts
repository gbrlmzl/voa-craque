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

  context("alterar a forma de pagamento", () => {
    beforeEach(() => {
      cy.cenario("pelada-aberta").then((resultado) => {
        gameDayId = resultado.gameDayId!;
      });
    });

    const dadosDoJogador = (username: string) =>
      cy.task(
        "sql",
        `select r."paymentMethod", r."paymentStatus", r."receiptUrl" from "Registration" r join "User" u on u.id = r."userId" where u.username = '${username}'`,
      ) as unknown as Cypress.Chainable<{ paymentMethod: string; paymentStatus: string; receiptUrl: string | null }[]>;

    it("no local troca para PIX anexando o comprovante e fica travado ate o organizador decidir", () => {
      cy.entrarComo("jogador03");
      cy.visit(`/game-days/${gameDayId}`);
      cy.contains("Pago no local").should("be.visible");
      cy.findByRole("button", { name: "Alterar pagamento" }).should("be.enabled").click();

      const dialog = () => cy.findByRole("dialog", { name: "Alterar forma de pagamento" });
      dialog().findByRole("button", { name: "Alterar" }).click();
      dialog().contains("Anexe o comprovante do PIX.").should("be.visible");

      cy.get('input[type="file"]').selectFile("tests/helpers/fixtures/comprovante.png", { force: true });
      cy.findByRole("dialog", { name: "Seu comprovante" }).findByRole("button", { name: /Confirmar/ }).click();
      dialog().findByRole("button", { name: "Alterar" }).click();

      cy.findByRole("status").should("contain.text", "Forma de pagamento alterada.");
      cy.findByRole("dialog").should("not.exist");
      cy.contains("PIX ·").should("be.visible");
      cy.findByRole("button", { name: /Ver meu comprovante/ }).should("be.visible");
      cy.findByRole("button", { name: "Alterar pagamento" }).should("be.disabled");
      cy.contains("Seu comprovante está em análise").should("be.visible");
      dadosDoJogador("jogador03").then((rows) => {
        expect(rows[0].paymentMethod).to.eq("PIX");
        expect(rows[0].paymentStatus).to.eq("PENDING");
        expect(rows[0].receiptUrl).to.match(/^\/api\/files\/comprovantes\//);
      });
    });

    it("PIX com comprovante so troca depois que o organizador recusa; o botao nao some enquanto isso", () => {
      cy.entrarComo("jogador01");
      cy.visit(`/game-days/${gameDayId}`);
      cy.findByRole("button", { name: "Alterar pagamento" }).should("be.disabled");
      cy.findByRole("button", { name: "Cancelar inscrição" }).should("be.enabled");
      cy.contains("Seu comprovante está em análise").should("be.visible");

      cy.entrarComo("organizador");
      cy.visit(`/game-days/${gameDayId}`);
      cy.findByRole("button", { name: /Pagamentos/ }).click();
      cy.findByRole("dialog", { name: "Pagamentos" }).findByRole("button", { name: "Recusar pagamento de Jogador 01" }).click();
      cy.findByLabelText("Motivo da recusa").type("Valor incorreto");
      cy.findByRole("button", { name: "Recusar pagamento" }).click();
      cy.findByRole("status").should("contain.text", "Pagamento de Jogador 01 recusado.");

      cy.entrarComo("jogador01");
      cy.visit(`/game-days/${gameDayId}`);
      cy.contains("Valor incorreto").should("be.visible");
      cy.findByRole("button", { name: "Alterar pagamento" }).should("be.enabled").click();
      cy.findByRole("dialog", { name: "Alterar forma de pagamento" }).findByRole("button", { name: "Alterar" }).click();

      cy.findByRole("status").should("contain.text", "Forma de pagamento alterada.");
      cy.contains("Pago no local").should("be.visible");
      cy.contains("Valor incorreto").should("not.exist");
      cy.findByRole("button", { name: /Ver meu comprovante/ }).should("not.exist");
      cy.findByRole("button", { name: "Alterar pagamento" }).should("be.enabled");
      dadosDoJogador("jogador01").then((rows) => {
        expect(rows[0]).to.deep.equal({ paymentMethod: "ON_SITE", paymentStatus: "PENDING", receiptUrl: null });
      });
    });

    it("pagamento confirmado pelo organizador trava o botao", () => {
      cy.entrarComo("organizador");
      cy.visit(`/game-days/${gameDayId}`);
      cy.findByRole("button", { name: /Pagamentos/ }).click();
      cy.findByRole("dialog", { name: "Pagamentos" }).findByRole("button", { name: "Confirmar pagamento de Jogador 03" }).click();
      cy.findByRole("status").should("contain.text", "Pagamento de Jogador 03 confirmado.");

      cy.entrarComo("jogador03");
      cy.visit(`/game-days/${gameDayId}`);
      cy.findByRole("button", { name: "Alterar pagamento" }).should("be.disabled");
      cy.contains("O organizador já confirmou o seu pagamento.").should("be.visible");
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
