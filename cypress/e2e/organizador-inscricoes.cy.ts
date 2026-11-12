describe("Organizador: inscricoes e pagamentos", () => {
  let settings: string;
  let pelada: string;

  beforeEach(() => {
    cy.cenario("pelada-aberta").then(({ gameDayId }) => {
      settings = `/game-days/${gameDayId}/settings`;
      pelada = `/game-days/${gameDayId}`;
    });
    cy.entrarComo("organizador");
  });

  it("inscreve jogadores pelo organizador e avisa com a opcao de desfazer", () => {
    cy.visit(settings);
    cy.findByRole("button", { name: /Inscrever jogadores/ }).click();
    const dialog = () => cy.findByRole("dialog", { name: "Inscrever jogadores" });
    dialog().contains("6/10 inscritos").should("be.visible");
    dialog().findByRole("checkbox", { name: /Jogador 07/ }).click();
    dialog().findByRole("checkbox", { name: /Jogador 08/ }).click();
    dialog().findByRole("button", { name: "Inscrever 2 jogadores" }).click();
    cy.findByRole("status").should("contain.text", "2 jogadores inscritos.");
    cy.findByRole("button", { name: "Desfazer" }).should("be.visible");
    cy.task("sql", `select count(*)::int as n from "Registration"`).then((rows) => {
      expect((rows as { n: number }[])[0].n).to.eq(8);
    });
  });

  it("aprova um pagamento no local e recusa um PIX com motivo", () => {
    cy.visit(pelada);
    cy.findByRole("button", { name: /Pagamentos/ }).click();
    cy.findByRole("dialog", { name: "Pagamentos" }).within(() => {
      cy.findByRole("button", { name: "Confirmar pagamento de Jogador 03" }).click();
    });
    cy.findByRole("status").should("contain.text", "Pagamento de Jogador 03 confirmado.");

    cy.findByRole("dialog", { name: "Pagamentos" }).within(() => {
      cy.findByRole("button", { name: "Recusar pagamento de Jogador 01" }).click();
    });
    cy.findByLabelText("Motivo da recusa").type("Valor incorreto");
    cy.findByRole("button", { name: "Recusar pagamento" }).click();
    cy.findByRole("status").should("contain.text", "Pagamento de Jogador 01 recusado.");
    cy.task("sql", `select "paymentStatus", "rejectedReason" from "Registration" r join "User" u on u.id = r."userId" where u.username = 'jogador01'`).then((rows) => {
      expect((rows as { paymentStatus: string; rejectedReason: string }[])[0]).to.deep.equal({ paymentStatus: "REJECTED", rejectedReason: "Valor incorreto" });
    });
  });

  it("abre o comprovante e aprova por la", () => {
    cy.visit(pelada);
    cy.findByRole("button", { name: /Pagamentos/ }).click();
    cy.findByRole("dialog", { name: "Pagamentos" }).findByRole("button", { name: "Comprovante de Jogador 02" }).click();
    cy.findByRole("dialog", { name: "Comprovante de Jogador 02" }).findByRole("button", { name: /Aprovar/ }).click();
    cy.findByRole("status").should("contain.text", "Pagamento de Jogador 02 confirmado.");
  });

  it("remove uma inscricao", () => {
    cy.visit(pelada);
    cy.findByRole("button", { name: /Pagamentos/ }).click();
    cy.findByRole("dialog", { name: "Pagamentos" }).findByRole("button", { name: "Remover inscrição de Jogador 06" }).click();
    cy.findByRole("dialog", { name: "Remover inscrição" }).findByRole("button", { name: "Remover" }).click();
    cy.findByRole("status").should("contain.text", "Inscrição de Jogador 06 removida.");
    cy.task("sql", `select count(*)::int as n from "Registration"`).then((rows) => {
      expect((rows as { n: number }[])[0].n).to.eq(5);
    });
  });
});
