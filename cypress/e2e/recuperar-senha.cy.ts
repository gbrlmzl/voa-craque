describe("Recuperar senha", () => {
  const email = "jogador05@teste.voacraque.app";

  beforeEach(() => cy.cenario("base"));

  it("'Esqueci a senha' responde igual com ou sem conta", () => {
    cy.visit("/forgot-password");
    cy.findByLabelText(/E-mail/).type("ninguem@teste.voacraque.app");
    cy.findByRole("button", { name: "Enviar link" }).click();
    cy.contains("Se existir uma conta com esse e-mail").should("be.visible");
  });

  it("o link redefine a senha, vale uma vez so e a senha nova entra", () => {
    cy.task("linkRedefinicao", email, { timeout: 60_000 }).then((link) => {
      cy.visit(link as string);
      cy.contains("h1", "Redefinir senha").should("be.visible");
      cy.findByLabelText(/^Senha nova/).type("Nova@Senha9");
      cy.findByLabelText(/^Repita a senha nova/).type("Nova@Senha9");
      cy.findByRole("button", { name: "Salvar nova senha" }).click();

      cy.location("pathname").should("eq", "/login");
      cy.contains("Senha redefinida. Entre com a senha nova.").should("be.visible");
      cy.findByLabelText("Usuário").type("jogador05");
      cy.findByLabelText("Senha").type("Nova@Senha9");
      cy.findByRole("button", { name: "Entrar" }).click();
      cy.location("pathname").should("eq", "/");

      cy.clearCookies();
      cy.visit(link as string);
      cy.contains("Este link é inválido ou expirou.").should("be.visible");
      cy.findByRole("link", { name: "Pedir um novo link" }).should("have.attr", "href", "/forgot-password");
    });
  });

  it("a senha antiga deixa de funcionar", () => {
    cy.task("linkRedefinicao", email, { timeout: 60_000 }).then((link) => {
      cy.visit(link as string);
      cy.findByLabelText(/^Senha nova/).type("Nova@Senha9");
      cy.findByLabelText(/^Repita a senha nova/).type("Nova@Senha9");
      cy.findByRole("button", { name: "Salvar nova senha" }).click();
      cy.location("pathname").should("eq", "/login");
      cy.findByLabelText("Usuário").type("jogador05");
      cy.findByLabelText("Senha").type("Senha@123");
      cy.findByRole("button", { name: "Entrar" }).click();
      cy.findByRole("alert").should("have.text", "Usuário ou senha não conferem.");
    });
  });

  it("link inventado mostra o erro sem formulario", () => {
    cy.visit("/reset-password?token=token-que-nao-existe-de-jeito-nenhum");
    cy.contains("Este link é inválido ou expirou.").should("be.visible");
    cy.findByLabelText(/^Senha nova/).should("not.exist");
  });
});
