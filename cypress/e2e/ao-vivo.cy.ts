describe("Ao vivo: painel do organizador", () => {
  let gameDayId: string;

  beforeEach(() => {
    cy.cenario("ao-vivo").then((resultado) => {
      gameDayId = resultado.gameDayId!;
      cy.entrarComo("organizador");
      cy.visit(`/game-days/${gameDayId}/panel`);
    });
  });

  it("apita, marca gol com assistencia, desfaz, pausa e encerra a partida", () => {
    cy.findByRole("button", { name: /Iniciar partida/ }).click();
    cy.findByRole("status").should("contain.text", "Partida iniciada.");
    cy.findByRole("button", { name: /Pausar/ }).should("be.visible");

    // Gol: o relogio pausa, o organizador escolhe a assistencia e o placar sobe.
    cy.findAllByRole("button", { name: /^Gol de / }).first().click();
    cy.findByRole("dialog").within(() => {
      cy.contains("Assistência de?").should("be.visible");
      cy.findAllByRole("button", { name: /Jogador/ }).first().click();
    });
    cy.contains("[role=status]", "Gol de").should("be.visible");
    cy.contains("Cronômetro parado. Toque em Retomar.").should("be.visible");
    cy.findByRole("button", { name: "Desfazer" }).click();
    cy.contains("[role=status]", "Desfeito.").should("be.visible");

    cy.findByRole("button", { name: /Retomar/ }).click();
    cy.findByRole("button", { name: /Pausar/ }).should("be.visible");
    cy.findByRole("button", { name: /Pausar/ }).click();
    cy.findByRole("button", { name: /Retomar/ }).should("be.visible");

    cy.findByRole("button", { name: /Encerrar partida/ }).click();
    cy.findByRole("status").should("contain.text", "Partida encerrada.");
    cy.contains("Empate — os dois saem").should("be.visible");
  });

  it("gol individual (sem assistencia) aparece nos lances", () => {
    cy.findByRole("button", { name: /Iniciar partida/ }).click();
    cy.findAllByRole("button", { name: /^Gol de / }).first().click();
    cy.findByRole("dialog").findByRole("button", { name: /Individual/ }).click();
    cy.contains("Lances").should("be.visible");
    cy.contains("[role=status]", "Gol de").should("be.visible");
  });

  it("substituicao: quem sai, quem entra da fila e confirmar", () => {
    cy.findByRole("button", { name: /Iniciar partida/ }).click();
    cy.findAllByRole("button", { name: /Substituição/ }).first().click();
    cy.findByRole("dialog", { name: /Substituição do Time/ }).within(() => {
      cy.findByRole("button", { name: "Confirmar substituição" }).should("be.disabled");
      cy.findAllByRole("button", { name: /Jogador/ }).first().click();
      cy.findAllByRole("button", { name: /Jogador/ }).last().click();
      cy.findByRole("button", { name: "Confirmar substituição" }).should("be.enabled").click();
    });
    cy.findByRole("status").should("contain.text", "Entrou");
    cy.contains("Lances").should("be.visible");
  });

  it("encerrar a partida mostra o resultado e leva a proxima; depois encerra a pelada", () => {
    cy.findByRole("button", { name: /Iniciar partida/ }).click();
    cy.findAllByRole("button", { name: /^Gol de / }).first().click();
    cy.findByRole("dialog").findByRole("button", { name: /Individual/ }).click();
    cy.findByRole("button", { name: /Retomar/ }).click();

    cy.findByRole("button", { name: /Encerrar partida/ }).click();
    cy.contains("Partida 1").should("be.visible");
    cy.findByRole("button", { name: /Próxima partida/ }).click();
    cy.findByRole("button", { name: /Iniciar partida/ }).should("be.visible");

    cy.contains("Fim de papo").should("be.visible");
    cy.findByRole("button", { name: /Encerrar pelada/ }).click();
    cy.findByRole("button", { name: "Encerrar mesmo" }).click();
    cy.findByRole("status").should("contain.text", "Pelada encerrada. Estatísticas contabilizadas.");
    cy.contains("Pelada encerrada").should("be.visible");

    cy.visit(`/game-days/${gameDayId}/stats`);
    cy.contains("Estatísticas da pelada").should("be.visible");
    cy.findAllByText(/jogos?/).should("have.length.gte", 1);
  });
});
