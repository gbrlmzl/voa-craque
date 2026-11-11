describe("Perfil, senha e preferencias", () => {
  beforeEach(() => {
    cy.cenario("base");
    cy.entrarComo("jogador01");
  });

  it("edita o perfil: o lapis libera o formulario e salvar avisa", () => {
    cy.visit("/profile");
    cy.contains("h1", "Jogador 01").should("be.visible");
    cy.findByRole("button", { name: "Editar dados" }).click();
    cy.findByDisplayValue("Jogador 01").clear().type("Jogador Renomeado");
    cy.findByRole("button", { name: "Salvar alterações" }).click();
    cy.findByRole("status").should("contain.text", "Perfil atualizado.");
    cy.contains("Jogador Renomeado").should("be.visible");
    cy.findByRole("button", { name: "Editar dados" }).should("be.visible");
  });

  it("cancelar com alteracao pergunta antes de descartar", () => {
    cy.visit("/profile");
    cy.findByRole("button", { name: "Editar dados" }).click();
    cy.findByDisplayValue("Jogador 01").type(" X");
    cy.findByRole("button", { name: "Cancelar" }).click();
    cy.findByRole("dialog", { name: "Descartar alterações?" }).should("be.visible");
    cy.findByRole("button", { name: "Continuar editando" }).click();
    cy.findByDisplayValue("Jogador 01 X").should("be.visible");
    cy.findByRole("button", { name: "Cancelar" }).click();
    cy.findByRole("button", { name: "Descartar" }).click();
    cy.findByRole("dialog").should("not.exist");
    cy.contains("Jogador 01").should("be.visible");
    cy.findByRole("button", { name: "Editar dados" }).should("be.visible");
  });

  it("sair da pagina com alteracao pendente tambem pergunta", () => {
    cy.visit("/profile");
    cy.findByRole("button", { name: "Editar dados" }).click();
    cy.findByDisplayValue("Jogador 01").type("!");
    cy.get("nav.fixed").findByRole("link", { name: "Ranking" }).click();
    cy.findByRole("dialog", { name: "Descartar alterações?" }).should("be.visible");
    cy.findByRole("button", { name: "Continuar editando" }).click();
    cy.location("pathname").should("eq", "/profile");
  });

  it("troca a foto: previa local, so envia ao salvar, e a foto nova passa a ser servida", () => {
    cy.visit("/profile");
    cy.findByRole("button", { name: "Editar dados" }).click();
    cy.get('input[type="file"]').selectFile("tests/helpers/fixtures/foto.jpg", { force: true });
    cy.contains("Foto nova. Ela só é enviada quando você salvar.").should("be.visible");
    cy.findByRole("button", { name: "Salvar alterações" }).click();
    cy.findByRole("status").should("contain.text", "Perfil atualizado.");
    cy.findByRole("button", { name: "Ver foto em tamanho maior" }).find("img").should("have.attr", "src").and("match", /^\/api\/files\/fotos\/.+\.webp$/).then((src) => {
      cy.request(src as unknown as string).then((response) => {
        expect(response.headers["content-type"]).to.eq("image/webp");
        expect(response.headers["cache-control"]).to.contain("immutable");
      });
    });
  });

  it("troca a senha pela tela de configuracoes e entra com a nova", () => {
    cy.visit("/settings");
    cy.findByRole("button", { name: "Alterar senha" }).click();
    cy.findByRole("dialog", { name: "Alterar senha" }).within(() => {
      cy.findByLabelText(/^Senha atual/).type("Senha@123");
      cy.findByLabelText(/^Senha nova/).type("Outra@Senha7");
      cy.findByLabelText(/^Repita a senha nova/).type("Outra@Senha7");
      cy.findByRole("button", { name: "Alterar senha" }).click();
    });
    cy.findByRole("status").should("contain.text", "Senha alterada.");

    cy.clearCookies();
    cy.visit("/login");
    cy.findByLabelText("Usuário").type("jogador01");
    cy.findByLabelText("Senha").type("Outra@Senha7");
    cy.findByRole("button", { name: "Entrar" }).click();
    cy.location("pathname").should("eq", "/");
  });

  it("senha atual errada mostra o erro no campo e nao fecha o modal", () => {
    cy.visit("/settings");
    cy.findByRole("button", { name: "Alterar senha" }).click();
    cy.findByRole("dialog").within(() => {
      cy.findByLabelText(/^Senha atual/).type("Errada@123");
      cy.findByLabelText(/^Senha nova/).type("Outra@Senha7");
      cy.findByLabelText(/^Repita a senha nova/).type("Outra@Senha7");
      cy.findByRole("button", { name: "Alterar senha" }).click();
      cy.contains("Senha atual incorreta.").should("be.visible");
    });
  });

  it("preferencia de nome dos times: troca na hora e o cookie guarda a escolha", () => {
    cy.visit("/settings");
    cy.contains("Assim: Time A, Time B, Time C").should("be.visible");
    cy.findByRole("button", { name: "Números (Time 1)" }).click();
    cy.contains("Assim: Time 1, Time 2, Time 3").should("be.visible");
    cy.findByRole("status").should("contain.text", "Preferência salva.");
    cy.getCookie("vc_team_label").should("have.property", "value", "numbers");
    cy.reload();
    cy.contains("Assim: Time 1, Time 2, Time 3").should("be.visible");
    cy.findByRole("button", { name: "Números (Time 1)" }).should("have.attr", "aria-pressed", "true");
  });
});
