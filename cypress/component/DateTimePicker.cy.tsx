import { useState } from "react";
import { DateTimePicker } from "@/components/forms/DateTimePicker";

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DateTimePicker value={value} onChange={setValue} id="quando" />
      <output data-cy="valor">{value}</output>
    </>
  );
}

const day = (n: number) => new RegExp(`(^|[ ,])${n} de `);

describe("DateTimePicker (navegador de verdade)", () => {
  beforeEach(() => {
    cy.clock(new Date(2030, 4, 10, 12, 0).getTime(), ["Date"]);
  });

  it("escolher dia, hora e minuto pelo toque e confirmar preenche o valor", () => {
    cy.mount(<Harness />);
    cy.findByRole("button", { name: /Escolha o dia e a hora/ }).click();
    cy.findByRole("dialog", { name: "Data e hora" }).within(() => {
      cy.findByRole("button", { name: day(20) }).click();
      cy.findByRole("button", { name: "21 horas" }).click();
      cy.findByRole("button", { name: "45 minutos" }).click();
      cy.findByRole("button", { name: "Confirmar" }).click();
    });
    cy.get("[data-cy=valor]").should("have.text", "2030-05-20T21:45");
    cy.findByRole("dialog").should("not.exist");
  });

  it("pelo teclado: os botoes recebem foco e Esc cancela sem alterar", () => {
    cy.mount(<Harness initial="2030-05-20T19:30" />);
    cy.findByRole("button", { name: /19:30/ }).click();
    cy.findByRole("dialog", { name: "Data e hora" }).should("be.visible");
    cy.findByRole("button", { name: "21 horas" }).focus().should("have.focus");
    cy.findByRole("button", { name: "45 minutos" }).focus().should("have.focus");
    cy.pressEscape();
    cy.findByRole("dialog").should("not.exist");
    cy.get("[data-cy=valor]").should("have.text", "2030-05-20T19:30");
  });

  it("a coluna de horas rola e abre centralizada na hora atual (19h por padrao)", () => {
    cy.mount(<Harness />);
    cy.findByRole("button", { name: /Escolha o dia e a hora/ }).click();
    cy.findByRole("button", { name: "19 horas" }).should("be.visible");
    cy.findByRole("button", { name: "00 horas" }).then(($zero) => {
      const grid = $zero.parent()[0];
      expect(grid.scrollTop).to.be.greaterThan(0);
      expect(grid.scrollHeight).to.be.greaterThan(grid.clientHeight);
    });
  });

  it("dias passados ficam desabilitados e o mes navega", () => {
    cy.mount(<Harness />);
    cy.findByRole("button", { name: /Escolha o dia e a hora/ }).click();
    cy.findByRole("button", { name: day(9) }).should("be.disabled");
    cy.findByRole("button", { name: "Próximo mês" }).click();
    cy.contains("p", /junho/i).should("be.visible");
  });

  it("o rodape com Confirmar continua visivel mesmo em tela pequena", () => {
    cy.viewport(360, 560);
    cy.mount(<Harness />);
    cy.findByRole("button", { name: /Escolha o dia e a hora/ }).click();
    cy.findByRole("button", { name: "Confirmar" }).should("be.visible").and("be.disabled");
  });
});
