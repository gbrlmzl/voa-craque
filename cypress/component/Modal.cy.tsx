import { useState } from "react";
import { Modal } from "@/components/ui";

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ height: 1200 }}>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <Modal
        open={open}
        title="Confirmar"
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
      >
        <button>Primeiro</button>
        <button>Ultimo</button>
      </Modal>
    </div>
  );
}

describe("Modal (navegador de verdade)", () => {
  it("abre com o dialogo nomeado pelo titulo", () => {
    cy.mount(<Harness />);
    cy.findByRole("dialog", { name: "Confirmar" }).should("be.visible");
  });

  it("Esc fecha", () => {
    cy.mount(<Harness />);
    cy.findByRole("dialog").should("exist");
    cy.pressEscape();
    cy.findByRole("dialog").should("not.exist");
  });

  it("clicar no fundo fecha; clicar no conteudo nao", () => {
    cy.mount(<Harness />);
    cy.findByText("Primeiro").click();
    cy.findByRole("dialog").should("exist");
    cy.findByRole("dialog").click("topLeft");
    cy.findByRole("dialog").should("not.exist");
  });

  it("o X fecha e chama onClose", () => {
    const onClose = cy.stub().as("onClose");
    cy.mount(<Harness onClose={onClose} />);
    cy.findByRole("button", { name: "Fechar" }).click();
    cy.get("@onClose").should("have.been.calledOnce");
  });

  it("o dialogo cobre a tela e fica na frente do restante", () => {
    cy.mount(<Harness />);
    cy.findByRole("dialog").should("have.css", "position", "fixed").and("have.css", "z-index", "50");
    cy.findByRole("dialog").then(($dialog) => {
      const rect = $dialog[0].getBoundingClientRect();
      // A pagina de teste rola (1200 px), entao o fundo perde a largura da barra de rolagem.
      expect(rect.left).to.equal(0);
      expect(rect.top).to.equal(0);
      expect(rect.width).to.be.within(Cypress.config("viewportWidth") - 20, Cypress.config("viewportWidth"));
      expect(rect.height).to.equal(Cypress.config("viewportHeight"));
    });
  });
});
