import { useState } from "react";
import { Checkbox, FloatingInput } from "@/components/ui";

const label = () => cy.findByText("E-mail", { selector: "label" });
const transformOf = ($label: JQuery<HTMLElement>) => getComputedStyle($label[0]).transform;

describe("FloatingInput (CSS modules de verdade)", () => {
  it("o rotulo sobe ao focar e ao preencher, e desce ao esvaziar e sair do campo", () => {
    cy.mount(<FloatingInput label="E-mail" />);
    const resting = "matrix(1, 0, 0, 1, 0, 16)";
    label().should(($l) => expect(transformOf($l)).to.equal(resting));

    cy.findByLabelText("E-mail").focus();
    label().should(($l) => expect(transformOf($l)).not.to.equal(resting));

    cy.findByLabelText("E-mail").type("a@b.com").blur();
    label().should(($l) => expect(transformOf($l)).not.to.equal(resting));

    cy.findByLabelText("E-mail").clear().blur();
    label().should(($l) => expect(transformOf($l)).to.equal(resting));
  });

  it("o recorte da borda acompanha o rotulo (legend so aparece com o rotulo no alto)", () => {
    cy.mount(<FloatingInput label="E-mail" />);
    cy.get("legend").then(($legend) => {
      const resting = getComputedStyle($legend[0]).maxWidth;
      cy.findByLabelText("E-mail").focus();
      cy.get("legend").should(($after) => expect(getComputedStyle($after[0]).maxWidth).not.to.equal(resting));
    });
  });

  it("senha: o olho mostra e oculta pelo mouse (sem entrar na ordem do Tab)", () => {
    cy.mount(<FloatingInput label="Senha" type="password" />);
    cy.findByLabelText("Senha").should("have.attr", "type", "password");
    cy.findByRole("button", { name: "Mostrar senha" }).should("have.attr", "tabindex", "-1").click();
    cy.findByLabelText("Senha").should("have.attr", "type", "text");
    cy.findByRole("button", { name: "Ocultar senha" }).click();
    cy.findByLabelText("Senha").should("have.attr", "type", "password");
  });

  it("erro deixa a borda vermelha e liga a descricao do campo", () => {
    cy.mount(<FloatingInput label="E-mail" error="E-mail invalido." />);
    cy.findByLabelText("E-mail").should("have.attr", "aria-invalid", "true").and("have.attr", "aria-describedby");
    cy.findByText("E-mail invalido.").should("be.visible").and("have.class", "text-rose-400");
  });

  it("campo desabilitado nao recebe foco", () => {
    cy.mount(<FloatingInput label="E-mail" disabled />);
    cy.findByLabelText("E-mail").should("be.disabled");
  });
});

describe("Checkbox (CSS modules de verdade)", () => {
  function Harness() {
    const [checked, setChecked] = useState(false);
    return <Checkbox label="Manter login" checked={checked} onChange={(e) => setChecked(e.target.checked)} />;
  }

  it("marca por clique no texto e por teclado, e o icone de marcado aparece", () => {
    cy.mount(<Harness />);
    cy.findByRole("checkbox", { name: "Manter login" }).should("not.be.checked");
    cy.findByText("Manter login").click();
    cy.findByRole("checkbox").should("be.checked");
    cy.findByRole("checkbox").focus().type(" ");
    cy.findByRole("checkbox").should("not.be.checked");
    cy.findByRole("checkbox").type(" ").should("be.checked");
  });

  it("o anel de foco so aparece com o teclado", () => {
    cy.mount(<Harness />);
    cy.findByRole("checkbox").focus();
    cy.findByRole("checkbox").parent().should("exist");
  });

  it("desabilitado nao muda ao clicar", () => {
    cy.mount(<Checkbox label="Fixo" disabled defaultChecked />);
    cy.findByText("Fixo").click({ force: true });
    cy.findByRole("checkbox").should("be.checked").and("be.disabled");
  });
});
