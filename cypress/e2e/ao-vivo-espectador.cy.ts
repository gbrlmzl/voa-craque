describe("Ao vivo: espectador", () => {
  it("um gol registrado pelo organizador aparece na tela do espectador sem recarregar", () => {
    cy.cenario("ao-vivo").then(({ gameDayId }) => {
      cy.task("sql", `select m.id as "matchId", m."homeTeamId" as "teamId", (select tp."userId" from "TeamPlayer" tp where tp."teamId" = m."homeTeamId" order by tp."userId" limit 1) as "userId" from "Match" m where m."gameDayId" = '${gameDayId}' and m.status = 'SCHEDULED'`).then((rows) => {
        const { matchId, teamId, userId } = (rows as { matchId: string; teamId: string; userId: string }[])[0];

        // O espectador e visitante: nenhum cookie no navegador. O organizador age por cy.request com o cookie dele.
        cy.task("sessao", "organizador", { timeout: 60_000 }).then((cookies) => {
          const cookie = (cookies as { name: string; value: string }[]).map((c) => `${c.name}=${c.value}`).join("; ");
          const request = (url: string, body: object) => cy.request({ method: "POST", url, body, headers: { cookie } });

          cy.visit(`/game-days/${gameDayId}/live`);
          cy.contains("h1", "Ao vivo").should("be.visible");
          cy.contains("Partida 1").should("be.visible");
          cy.contains("ao vivo", { matchCase: false }).should("be.visible");
          cy.contains("Nada marcado ainda").should("be.visible");

          request(`/api/matches/${matchId}/state`, { action: "START" }).its("status").should("eq", 200);
          cy.contains("Em andamento").should("be.visible");

          request(`/api/matches/${matchId}/events`, { type: "GOAL", teamId, userId }).its("status").should("eq", 200);
          cy.contains("Nada marcado ainda").should("not.exist");
          cy.contains("⚽").should("be.visible");
        });
      });
    });
  });

  it("o visitante nao tem controles de organizador", () => {
    cy.cenario("ao-vivo").then(({ gameDayId }) => {
      cy.visit(`/game-days/${gameDayId}/live`);
      cy.findByRole("button", { name: /Iniciar partida/ }).should("not.exist");
      cy.findAllByRole("button", { name: /^Gol de / }).should("not.exist");
    });
  });
});
