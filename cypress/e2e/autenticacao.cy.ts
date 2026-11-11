describe("Autenticacao (formulario de verdade)", () => {
  beforeEach(() => cy.cenario("base"));

  it("cadastro pela tela leva ao onboarding e, com o perfil pronto, ao inicio", () => {
    cy.visit("/register");
    cy.findByLabelText("Nome de usuário").type("craque.novo");
    cy.findByLabelText("E-mail").type("craque.novo@teste.voacraque.app");
    cy.findByLabelText("Senha", { selector: "input" }).type("Senha@123");
    cy.findByLabelText("Repita a senha").type("Senha@123");
    cy.findByRole("button", { name: "Criar conta" }).should("be.enabled").click();

    cy.location("pathname").should("eq", "/onboarding");
    cy.contains("Bem-vindo, craque.novo").should("be.visible");
    cy.findByPlaceholderText("Seu nome").type("Craque Novo");
    cy.findByPlaceholderText("21").type("27");
    cy.findByPlaceholderText("178").type("176");
    cy.findByPlaceholderText("75").type("72");
    cy.findByRole("button", { name: "Salvar e entrar" }).click();

    cy.location("pathname").should("eq", "/");
    cy.contains("h1", "Craque").should("be.visible");
  });

  it("logout pelo menu da conta volta para a pagina publica", () => {
    cy.entrarComo("jogador01");
    cy.visit("/");
    cy.sair();
    cy.location("pathname").should("eq", "/");
    cy.findAllByRole("link", { name: /Login/ }).should("have.length.gte", 1);
  });

  it("senha errada mostra a mesma mensagem generica de usuario inexistente", () => {
    cy.visit("/login");
    cy.findByLabelText("Usuário").type("jogador01");
    cy.findByLabelText("Senha").type("Errada@123");
    cy.findByRole("button", { name: "Entrar" }).click();
    cy.findByRole("alert").should("have.text", "Usuário ou senha não conferem.");

    cy.findByLabelText("Usuário").clear().type("ninguem.assim");
    cy.findByLabelText("Senha").type("Errada@123");
    cy.findByRole("button", { name: "Entrar" }).click();
    cy.findByRole("alert").should("have.text", "Usuário ou senha não conferem.");
    cy.location("pathname").should("eq", "/login");
  });

  it("login certo entra no inicio", () => {
    cy.visit("/login");
    cy.findByLabelText("Usuário").type("jogador01");
    cy.findByLabelText("Senha").type("Senha@123");
    cy.findByRole("button", { name: "Entrar" }).click();
    cy.location("pathname").should("eq", "/");
    cy.contains("h1", "Jogador").should("be.visible");
  });

  it("'manter login' grava o cookie de renovacao com validade; sem ele o cookie e de sessao", () => {
    cy.visit("/login");
    cy.findByLabelText("Usuário").type("jogador02");
    cy.findByLabelText("Senha").type("Senha@123");
    cy.findByRole("checkbox", { name: "Manter login" }).check({ force: true });
    cy.findByRole("button", { name: "Entrar" }).click();
    cy.location("pathname").should("eq", "/");
    cy.getCookie("voacraque.refresh").should("exist").and((cookie) => {
      expect(cookie?.expiry, "cookie persistente").to.be.a("number");
    });

    cy.clearCookies();
    cy.visit("/login");
    cy.findByLabelText("Usuário").type("jogador03");
    cy.findByLabelText("Senha").type("Senha@123");
    cy.findByRole("button", { name: "Entrar" }).click();
    cy.location("pathname").should("eq", "/");
    cy.getCookie("voacraque.refresh").should("exist").and((cookie) => {
      expect(cookie?.expiry, "cookie de sessao").to.be.undefined;
    });
  });

  it("quem ja esta logado e redirecionado para fora das telas de visitante", () => {
    cy.entrarComo("jogador01");
    cy.visit("/login");
    cy.location("pathname").should("eq", "/");
    cy.visit("/register");
    cy.location("pathname").should("eq", "/");
  });
});
