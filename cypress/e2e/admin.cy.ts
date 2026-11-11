describe("Administracao (superadmin e organizador)", () => {
  beforeEach(() => cy.cenario("encerrada"));

  it("superadmin promove um jogador a organizador e a auditoria registra", () => {
    cy.entrarComo("super");
    cy.visit("/admin/users");
    cy.contains("h1", "Usuários e papéis").should("be.visible");
    cy.findByLabelText("Papel de Super Admin").should("be.disabled");
    cy.findByLabelText("Papel de Jogador 03").select("Organizador");
    cy.findByRole("status").should("contain.text", "Jogador 03 agora é Organizador.");

    cy.visit("/admin/audit");
    cy.contains("h1", "Auditoria").should("be.visible");
    cy.contains("Papel alterado").should("be.visible");
    cy.contains("Jogador 03: USER para ADMIN").should("be.visible");
  });

  it("o jogador promovido ganha acesso de organizador", () => {
    cy.entrarComo("super");
    cy.visit("/admin/users");
    cy.findByLabelText("Papel de Jogador 03").select("Organizador");
    cy.findByRole("status").should("contain.text", "agora é Organizador");
    cy.entrarComo("jogador03");
    cy.visit("/game-days");
    cy.findByRole("link", { name: "Nova pelada" }).should("be.visible");
  });

  it("organizador avalia as estrelas de um jogador", () => {
    cy.entrarComo("organizador");
    cy.visit("/players");
    cy.contains("h1", "Avaliar jogadores").should("be.visible");
    cy.findByPlaceholderText("Buscar jogador").type("Jogador 05");
    cy.findByRole("button", { name: /Jogador 05/ }).click();
    cy.findByRole("button", { name: "4,5" }).click();
    cy.findByRole("button", { name: "Salvar avaliação" }).click();
    cy.findByRole("status").should("contain.text", "Jogador 05 avaliado.");
    cy.task("sql", `select p.stars from "PlayerProfile" p join "User" u on u.id = p."userId" where u.username = 'jogador05'`).then((rows) => {
      expect((rows as { stars: number }[])[0].stars).to.eq(4.5);
    });
  });

  it("superadmin recalcula o MMR e o resultado e o mesmo", () => {
    cy.entrarComo("super");
    cy.task("sql", `select "userId", mmr from "PlayerRating" order by "userId"`).then((before) => {
      cy.visit("/admin/system");
      cy.contains("h1", "Sistema").should("be.visible");
      cy.findByRole("button", { name: /Recalcular o MMR/ }).click();
      cy.findByRole("button", { name: /Recalcular mesmo assim/ }).click();
      cy.findByRole("status").should("contain.text", "MMR recomputado: 1 peladas, 12 jogadores.");
      cy.task("sql", `select "userId", mmr from "PlayerRating" order by "userId"`).should("deep.equal", before);
    });
  });

  it("superadmin liga a manutencao pelas configuracoes e o site cai para os outros", () => {
    cy.entrarComo("super");
    cy.visit("/admin/system");
    cy.findByText("Site liberado").click();
    cy.findByRole("button", { name: "Salvar" }).click();
    cy.findByRole("status").should("contain.text", "Configuração salva.");
    cy.clearCookies();
    cy.visit("/ranking");
    cy.location("pathname").should("eq", "/maintenance");
  });

  it("jogador comum nao entra nas telas de administracao", () => {
    cy.entrarComo("jogador01");
    for (const path of ["/admin/users", "/admin/system", "/admin/audit", "/players"]) {
      cy.visit(path);
      cy.location("pathname").should("eq", "/");
    }
  });
});
