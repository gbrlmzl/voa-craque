describe("Organizador: criar, editar, cancelar e restaurar a pelada", () => {
  beforeEach(() => cy.cenario("base"));

  it("cria a pelada pelo formulario escolhendo a data no seletor", () => {
    cy.entrarComo("organizador");
    cy.visit("/game-days/new");
    cy.contains("h1", "Nova pelada").should("be.visible");

    cy.findByPlaceholderText("Pelada de quinta").type("Pelada de sexta");
    cy.contains("label", "Data e hora").find("button").click();
    cy.findByRole("dialog", { name: "Data e hora" }).within(() => {
      cy.findByRole("button", { name: "Amanhã" }).click();
      cy.findByRole("button", { name: "21 horas" }).click();
      cy.findByRole("button", { name: "30 minutos" }).click();
      cy.findByRole("button", { name: "Confirmar" }).click();
    });
    cy.contains("label", "Data e hora").find("button").should("contain.text", "21:30");
    cy.findByPlaceholderText("Ginásio do Sesi").type("Quadra do Bairro");
    cy.contains("label", "Chave PIX").find("input").type("pix@voacraque.app");
    cy.findByRole("button", { name: "Criar pelada" }).click();

    cy.location("pathname").should("match", /^\/game-days\/[^/]+$/);
    cy.contains("h1", "Pelada de sexta").should("be.visible");
    cy.contains("Quadra do Bairro").should("be.visible");
    cy.contains("Inscrições abertas").should("be.visible");
    cy.contains("4,50").should("be.visible");
  });

  it("sem escolher a data o formulario pede o dia e a hora", () => {
    cy.entrarComo("organizador");
    cy.visit("/game-days/new");
    cy.findByPlaceholderText("Pelada de quinta").type("Pelada sem data");
    cy.findByPlaceholderText("Ginásio do Sesi").type("Quadra");
    cy.contains("label", "Chave PIX").find("input").type("pix");
    cy.findByRole("button", { name: "Criar pelada" }).click();
    cy.contains("Escolha o dia e a hora.").should("be.visible");
    cy.location("pathname").should("eq", "/game-days/new");
  });

  it("jogador comum nao ve o botao de nova pelada", () => {
    cy.entrarComo("jogador01");
    cy.visit("/game-days");
    cy.findByRole("link", { name: "Nova pelada" }).should("not.exist");
  });

  it("edita a pelada pelas configuracoes", () => {
    cy.cenario("pelada-aberta").then(({ gameDayId }) => {
      cy.entrarComo("organizador");
      cy.visit(`/game-days/${gameDayId}`);
      cy.findByRole("link", { name: "Configurações da pelada" }).click();
      cy.findByRole("link", { name: /Editar pelada/ }).click();
      cy.contains("h1", "Editar pelada").should("be.visible");
      cy.findByPlaceholderText("Pelada de quinta").clear().type("Pelada renomeada");
      cy.findByRole("button", { name: "Salvar alterações" }).click();
      cy.location("pathname").should("eq", `/game-days/${gameDayId}`);
      cy.contains("h1", "Pelada renomeada").should("be.visible");
    });
  });

  it("cancela a pelada: fica cancelada para todos e as inscricoes seguem registradas", () => {
    cy.cenario("pelada-aberta").then(({ gameDayId }) => {
      cy.entrarComo("organizador");
      cy.visit(`/game-days/${gameDayId}/settings`);
      cy.findByRole("button", { name: /Cancelar pelada/ }).click();
      cy.findByRole("button", { name: "Voltar" }).click();
      cy.findByRole("button", { name: /Cancelar pelada/ }).click();
      cy.findByRole("button", { name: "Cancelar mesmo" }).click();

      cy.location("pathname").should("eq", `/game-days/${gameDayId}`);
      cy.contains("Esta pelada foi cancelada pelo organizador.").should("be.visible");
      cy.task("sql", `select count(*)::int as n from "Registration" where "gameDayId" = '${gameDayId}'`).then((rows) => {
        expect((rows as { n: number }[])[0].n).to.eq(6);
      });
    });
  });

  it("restaura uma pelada com times definidos para aberta", () => {
    cy.cenario("times-definidos").then(({ gameDayId }) => {
      cy.entrarComo("organizador");
      cy.visit(`/game-days/${gameDayId}/settings`);
      cy.findByRole("button", { name: /Restaurar/ }).click();
      cy.findByRole("button", { name: "Restaurar mesmo" }).click();
      cy.location("pathname").should("eq", `/game-days/${gameDayId}`);
      cy.contains("Inscrições abertas").should("be.visible");
      cy.task("sql", `select count(*)::int as n from "Team" where "gameDayId" = '${gameDayId}'`).then((rows) => {
        expect((rows as { n: number }[])[0].n).to.eq(0);
      });
    });
  });
});
