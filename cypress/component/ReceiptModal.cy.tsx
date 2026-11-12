import { RegistrationPanel } from "@/components/gameday/RegistrationPanel";

const mountPanel = () =>
  cy.mount(<RegistrationPanel gameDayId="g1" price="R$ 10,00" pixKey="pix@voacraque.app" registration={null} open full={false} />);

describe("Comprovante (anexar arquivo de verdade)", () => {
  it("anexar uma imagem abre a conferencia com a previa carregada e permite confirmar", () => {
    mountPanel();
    cy.get('input[type="file"]').selectFile("tests/helpers/fixtures/comprovante.png", { force: true });
    cy.findByRole("dialog", { name: "Seu comprovante" }).within(() => {
      cy.findByRole("img", { name: "Seu comprovante" }).should(($img) => {
        expect(($img[0] as HTMLImageElement).naturalWidth).to.equal(400);
      });
      cy.findByRole("button", { name: /Confirmar/ }).click();
    });
    cy.findByText("comprovante.png").should("be.visible");
    cy.findByRole("button", { name: "Ver comprovante" }).click();
    cy.findByRole("img", { name: "Seu comprovante" }).should("be.visible");
  });

  it("o botao de tela cheia amplia a imagem e Esc fecha so a tela cheia", () => {
    mountPanel();
    cy.get('input[type="file"]').selectFile("tests/helpers/fixtures/comprovante.png", { force: true });
    cy.findByRole("button", { name: "Ver comprovante em tela cheia" }).click();
    cy.findByRole("dialog", { name: /em tela cheia/ }).should("be.visible");
    cy.pressEscape();
    cy.findByRole("dialog", { name: /em tela cheia/ }).should("not.exist");
    cy.findByRole("dialog", { name: "Seu comprovante" }).should("be.visible");
  });

  it("arquivo grande demais mostra o erro e nao abre a conferencia", () => {
    mountPanel();
    cy.get('input[type="file"]').selectFile(
      { contents: Cypress.Buffer.alloc(6 * 1024 * 1024), fileName: "grande.png", mimeType: "image/png" },
      { force: true },
    );
    cy.findByText("Arquivo muito grande. O limite é 5 MB.").should("be.visible");
    cy.findByRole("dialog").should("not.exist");
  });

  it("arquivo que nao e imagem mostra o erro de formato", () => {
    mountPanel();
    cy.get('input[type="file"]').selectFile("tests/helpers/fixtures/nao-imagem.txt", { force: true });
    cy.findByText("Formato inválido. Envie uma imagem JPEG, PNG ou WebP.").should("be.visible");
  });

  it("enviar sobe o arquivo para /api/uploads e depois inscreve com a URL devolvida", () => {
    cy.intercept("POST", "/api/uploads", { body: { url: "/api/files/comprovantes/c.png" } }).as("upload");
    cy.intercept("POST", "/api/game-days/g1/registrations", { body: { id: "r1" } }).as("inscricao");
    mountPanel();
    cy.get('input[type="file"]').selectFile("tests/helpers/fixtures/comprovante.png", { force: true });
    cy.findByRole("dialog").findByRole("button", { name: /Confirmar/ }).click();
    cy.findByRole("button", { name: "Confirmar inscrição" }).click();
    cy.wait("@upload");
    cy.wait("@inscricao").its("request.body").should("deep.equal", { paymentMethod: "PIX", receiptUrl: "/api/files/comprovantes/c.png" });
    cy.findByRole("status").should("contain.text", "Inscrição feita");
  });
});
