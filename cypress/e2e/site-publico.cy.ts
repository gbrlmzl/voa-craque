describe("Site publico (visitante) e login sob demanda", () => {
  let gameDayId: string;

  beforeEach(() => {
    cy.cenario("pelada-aberta").then((resultado) => {
      gameDayId = resultado.gameDayId!;
    });
  });

  it("visitante ve o inicio, as peladas, a pelada e o ranking sem entrar", () => {
    cy.visit("/");
    cy.contains("h1", "craque").should("be.visible");
    cy.contains("Pelada de teste").should("be.visible");

    cy.visit("/game-days");
    cy.contains("h1", "Peladas").should("be.visible");
    cy.contains("6/10 inscritos").should("be.visible");
    cy.findByRole("link", { name: "Nova pelada" }).should("not.exist");

    cy.visit(`/game-days/${gameDayId}`);
    cy.contains("h1", "Pelada de teste").should("be.visible");
    cy.contains("Quem vai").should("be.visible");

    cy.visit("/ranking");
    cy.contains("h1", "Ranking").should("be.visible");
    cy.location("pathname").should("eq", "/ranking");
  });

  it("'Quero jogar' leva ao login e, depois de entrar, volta para a pelada", () => {
    cy.visit(`/game-days/${gameDayId}`);
    cy.findByRole("link", { name: /Quero jogar/ }).click();
    cy.location().should((location) => {
      expect(location.pathname).to.eq("/login");
      expect(decodeURIComponent(location.search)).to.contain(`proximo=/game-days/${gameDayId}`);
    });
    cy.findByLabelText("Usuário").type("jogador10");
    cy.findByLabelText("Senha").type("Senha@123");
    cy.findByRole("button", { name: "Entrar" }).click();
    cy.location("pathname").should("eq", `/game-days/${gameDayId}`);
    cy.findByRole("button", { name: "Confirmar inscrição" }).should("be.visible");
  });

  it("jogador sem perfil monta o perfil no caminho e volta para a pelada", () => {
    cy.visit(`/login?proximo=/game-days/${gameDayId}`);
    cy.findByLabelText("Usuário").type("novato");
    cy.findByLabelText("Senha").type("Senha@123");
    cy.findByRole("button", { name: "Entrar" }).click();
    cy.location("pathname").should("eq", "/onboarding");
    cy.findByPlaceholderText("Seu nome").type("Novato da Silva");
    cy.findByPlaceholderText("21").type("23");
    cy.findByPlaceholderText("178").type("170");
    cy.findByPlaceholderText("75").type("66");
    cy.findByRole("button", { name: "Salvar e entrar" }).click();
    cy.location("pathname").should("eq", `/game-days/${gameDayId}`);
  });

  it("paginas de gestao continuam pedindo login", () => {
    cy.visit("/game-days/new");
    cy.location("pathname").should("eq", "/login");
    cy.visit("/players");
    cy.location("pathname").should("eq", "/login");
  });

  it("a API protegida recusa visitante com 401", () => {
    cy.request({ url: "/api/game-days", failOnStatusCode: false }).its("status").should("eq", 401);
  });
});
