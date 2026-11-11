describe("Ranking, estatisticas da pelada e story", () => {
  let gameDayId: string;

  beforeEach(() => {
    cy.cenario("encerrada").then((resultado) => {
      gameDayId = resultado.gameDayId!;
    });
  });

  it("ranking: ordenado pelo MMR, com as categorias e a ficha do jogador", () => {
    cy.visit("/ranking");
    cy.contains("h1", "Ranking").should("be.visible");
    cy.findByRole("button", { name: "Geral" }).should("be.visible");
    cy.get("button.rounded-xl").should("have.length.gte", 12);
    cy.findByRole("button", { name: "Artilharia" }).click();
    cy.get("button.rounded-xl").first().should("contain.text", "jogos").and("contain.text", "Jogador");
    cy.findByRole("button", { name: "Assistências" }).click();
    cy.findByRole("button", { name: "Aproveitamento" }).click();
    cy.get("button.rounded-xl").first().should("contain.text", "V");
    cy.findByRole("button", { name: "Presença" }).click();
    cy.get("button.rounded-xl").first().click();
    cy.findByRole("dialog").should("contain.text", "Gols").and("contain.text", "Vitórias");
    cy.findByRole("button", { name: "Fechar" }).click();
    cy.findByRole("dialog").should("not.exist");
  });

  it("ficha do jogador: com MMR mostra o historico da pelada", () => {
    cy.visit("/ranking");
    cy.get("button.rounded-xl").first().click();
    cy.findByRole("dialog").within(() => {
      cy.findByRole("button", { name: /Histórico/ }).click();
      cy.contains("MMR").should("be.visible");
      cy.contains("Pelada de teste").should("be.visible");
      cy.findByRole("button", { name: "Voltar" }).click();
      cy.contains("Altura").should("be.visible");
    });
  });

  it("estatisticas da pelada sao publicas e mostram gols, assistencias e selos", () => {
    cy.visit(`/game-days/${gameDayId}/stats`);
    cy.contains("Estatísticas da pelada").should("be.visible");
    cy.contains("12 jogadores").should("be.visible");
    cy.findAllByLabelText("Artilheiro").should("have.length.gte", 1);
    cy.findByLabelText("MVP da pelada").should("exist");
    cy.contains("gols", { matchCase: false }).should("be.visible");
  });

  it("jogador que participou compartilha o story: o PNG e baixado", () => {
    cy.entrarComo("jogador01");
    cy.visit(`/game-days/${gameDayId}`);
    cy.findByRole("button", { name: /Compartilhar meu desempenho/ }).click();
    cy.findByRole("dialog", { name: "Seu story da pelada" }).should("be.visible");
    cy.get("canvas").should(($canvas) => expect(($canvas[0] as HTMLCanvasElement).width).to.eq(1080));
    cy.findByText("Gerando...").should("not.exist");
    cy.findByRole("button", { name: /Baixar imagem/ }).should("be.enabled").click();
    cy.readFile("cypress/downloads/voacraque-jogador-01.png", null, { timeout: 15_000 }).should((bytes) => {
      expect((bytes as Uint8Array).length).to.be.greaterThan(20_000);
    });
  });

  it("pelada encerrada mostra o botao para as estatisticas", () => {
    cy.visit(`/game-days/${gameDayId}`);
    cy.findByRole("link", { name: /Ver estatísticas da pelada/ }).click();
    cy.location("pathname").should("eq", `/game-days/${gameDayId}/stats`);
  });
});
