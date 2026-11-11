import { AppShell } from "@/components/AppShell";
import { ADMIN } from "../support/component";

describe("AppShell (viewport)", () => {
  context("celular (390 px)", () => {
    beforeEach(() => cy.viewport(390, 844));

    it("mostra a barra de abas embaixo e esconde a navegacao do desktop", () => {
      cy.mount(<AppShell>conteudo</AppShell>, { user: ADMIN, pathname: "/ranking" });
      cy.get("nav.fixed").should("be.visible").and("have.css", "position", "fixed");
      cy.get("nav.fixed").within(() => {
        cy.findByRole("link", { name: "Ranking" }).should("have.class", "text-pitch-400");
        cy.findByRole("link", { name: "Perfil" }).should("be.visible");
      });
      cy.get("header nav").should("not.be.visible");
    });

    it("o avatar abre a gaveta com 'Sair' e ela fecha ao navegar", () => {
      cy.mount(<AppShell>conteudo</AppShell>, { user: ADMIN });
      cy.findByRole("button", { name: "Abrir menu" }).click();
      cy.findByRole("button", { name: "Sair" }).should("be.visible");
      cy.findByRole("link", { name: "Configurações" }).click();
      cy.findByRole("button", { name: "Sair" }).should("not.exist");
    });

    it("o conteudo nao fica escondido atras da barra de abas", () => {
      cy.mount(<AppShell><div style={{ height: 2000 }} data-cy="alto">fim</div></AppShell>, { user: ADMIN });
      cy.get("main").should("have.css", "padding-bottom").and("not.equal", "0px");
    });
  });

  context("desktop (1280 px)", () => {
    beforeEach(() => cy.viewport(1280, 800));

    it("mostra a navegacao no topo e esconde a barra de abas", () => {
      cy.mount(<AppShell>conteudo</AppShell>, { user: ADMIN, pathname: "/game-days" });
      cy.get("header nav").should("be.visible");
      cy.get("header nav").findByRole("link", { name: "Peladas" }).should("have.class", "bg-white/10");
      cy.get("nav.fixed").should("not.be.visible");
    });

    it("o menu da conta traz 'Sair' visivel", () => {
      cy.mount(<AppShell>conteudo</AppShell>, { user: ADMIN });
      cy.findByRole("button", { name: "Abrir menu da conta" }).click();
      cy.findByRole("menuitem", { name: "Sair" }).should("be.visible");
    });

    it("visitante ve o botao Login no topo", () => {
      cy.mount(<AppShell>conteudo</AppShell>, { user: null });
      cy.get("header").findByRole("button", { name: /Login/ }).should("be.visible");
    });
  });
});
