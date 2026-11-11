import { useState } from "react";
import { PhotoLightbox } from "@/components/PhotoLightbox";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Ver foto</button>
      {open ? <PhotoLightbox photoUrl="/foto.jpg" name="Gabriel" onClose={() => setOpen(false)} /> : null}
    </>
  );
}

describe("PhotoLightbox (imagem real)", () => {
  beforeEach(() => {
    cy.intercept("GET", "/foto.jpg", { fixture: "foto.jpg,null" }).as("foto");
  });

  it("abre com a foto carregada de verdade, quadrada e dentro da tela", () => {
    cy.mount(<Harness />);
    cy.findByRole("button", { name: "Ver foto" }).click();
    cy.findByRole("dialog", { name: "Foto de Gabriel" }).should("be.visible");
    cy.findByRole("img", { name: "Gabriel" })
      .should(($img) => expect(($img[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(0))
      .then(($img) => {
        const rect = $img[0].getBoundingClientRect();
        expect(Math.round(rect.width)).to.equal(Math.round(rect.height));
        expect(rect.width).to.be.at.most(Cypress.config("viewportWidth"));
      });
  });

  it("fecha pelo X, por Esc e clicando no fundo, mas nao clicando na foto", () => {
    cy.mount(<Harness />);
    cy.findByRole("button", { name: "Ver foto" }).click();
    cy.findByRole("img", { name: "Gabriel" }).click();
    cy.findByRole("dialog").should("exist");
    cy.findByRole("button", { name: "Fechar" }).click();
    cy.findByRole("dialog").should("not.exist");

    cy.findByRole("button", { name: "Ver foto" }).click();
    cy.pressEscape();
    cy.findByRole("dialog").should("not.exist");

    cy.findByRole("button", { name: "Ver foto" }).click();
    cy.findByRole("dialog").click("bottomRight");
    cy.findByRole("dialog").should("not.exist");
  });

  // GAP (docs/verificacao-testes/relatorio.md, "Lacunas de acessibilidade"): o lightbox nao move o foco
  // para o dialogo ao abrir nem o devolve ao botao ao fechar. Nao corrigido neste plano (secao 12).
  it.skip("devolve o foco ao botao que abriu", () => {
    cy.mount(<Harness />);
    cy.findByRole("button", { name: "Ver foto" }).click();
    cy.findByRole("button", { name: "Fechar" }).click();
    cy.focused().should("have.text", "Ver foto");
  });
});
