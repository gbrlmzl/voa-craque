describe("Site privado e manutencao", () => {
  it("privado: o visitante vai para o login em qualquer pagina de consulta", () => {
    cy.cenario("site-privado");
    for (const path of ["/", "/game-days", "/ranking"]) {
      cy.visit(path);
      cy.location("pathname").should("eq", "/login");
    }
  });

  it("privado: quem tem conta continua vendo tudo", () => {
    cy.cenario("site-privado");
    cy.entrarComo("jogador01");
    cy.visit("/ranking");
    cy.contains("h1", "Ranking").should("be.visible");
  });

  it("manutencao: o jogador ve a pagina de manutencao com a mensagem", () => {
    cy.cenario("manutencao");
    cy.entrarComo("jogador01");
    cy.visit("/ranking");
    cy.location("pathname").should("eq", "/maintenance");
    cy.contains("Voa Craque em manutenção").should("be.visible");
    cy.contains("Estamos em manutenção").should("be.visible");
    cy.findByRole("button", { name: "Sair da conta" }).should("be.visible");
  });

  it("manutencao: o visitante tambem, com o caminho de volta ao login", () => {
    cy.cenario("manutencao");
    cy.visit("/");
    cy.location("pathname").should("eq", "/maintenance");
    cy.findByRole("link", { name: "Voltar ao login" }).should("have.attr", "href", "/login");
  });

  it("manutencao: o superadmin continua entrando", () => {
    cy.cenario("manutencao");
    cy.entrarComo("super");
    cy.visit("/ranking");
    cy.location("pathname").should("eq", "/ranking");
    cy.contains("h1", "Ranking").should("be.visible");
    cy.visit("/maintenance");
    cy.location("pathname").should("eq", "/");
  });
});
