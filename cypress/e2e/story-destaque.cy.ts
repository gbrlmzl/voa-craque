import {
  ASSINATURA_DO_STORY,
  dimensoesDoPng,
  esperarStoryPronto,
  espiarCanvas,
  iniciais,
  registroDe,
  valorAntesDe,
} from "../support/story";

type Esperado = import("../tasks/cenarios").EsperadoJogador;

const comWebShare = (win: Cypress.AUTWindow) => {
  espiarCanvas(win);
  Object.defineProperty(win.navigator, "canShare", { configurable: true, value: () => true });
  Object.defineProperty(win.navigator, "share", { configurable: true, value: cy.stub().as("share").resolves(undefined) });
};

describe("Story de destaque depois da pelada", () => {
  let gameDayId: string;
  let artilheiro: Esperado;
  let semGol: Esperado;

  beforeEach(() => {
    cy.cenario("destaques").then(({ gameDayId: id, dados }) => {
      gameDayId = id!;
      artilheiro = dados!.jogadores[dados!.artilheiros[0]];
      // Jogou 1 partida, perdeu, nao fez gol nem assistencia: cai na "partida jogada".
      semGol = Object.values(dados!.jogadores).find((j) => j.gols === 0 && j.assistencias === 0 && j.vitorias === 0)!;
    });
  });

  it("o artilheiro abre o story: o cartao traz o nome, a pelada, os numeros reais e o selo ARTILHEIRO", () => {
    cy.entrarComo(artilheiro.username);

    // O selo MVP vem do calculo de MMR: confere com a pagina publica de estatisticas, sem recalcular nada aqui.
    cy.visit(`/game-days/${gameDayId}/stats`);
    cy.contains("span.truncate", artilheiro.nome)
      .closest("div.rounded-xl")
      .then(($linha) => {
        const eMvp = $linha.find('[aria-label="MVP da pelada"]').length > 0;
        cy.wrap(eMvp).as("eMvp");
      });

    cy.visit(`/game-days/${gameDayId}`, { onBeforeLoad: espiarCanvas });
    cy.findByRole("button", { name: /Compartilhar meu desempenho/ }).click();
    cy.findByRole("dialog", { name: "Seu story da pelada" }).should("be.visible");
    cy.get("canvas").should(($canvas) => {
      expect(($canvas[0] as HTMLCanvasElement).width).to.eq(1080);
      expect(($canvas[0] as HTMLCanvasElement).height).to.eq(1920);
    });
    esperarStoryPronto();

    cy.get<boolean>("@eMvp").then((eMvp) => {
      cy.window().then((win) => {
        const { textos, imagens } = registroDe(win);
        const aproveitamento = Math.round((artilheiro.vitorias / artilheiro.jogos) * 100);

        // Cabecalho: marca, pelada, local e nome (caixa alta, como o cartao desenha).
        expect(textos).to.include.members(["VOA CRAQUE", "PELADA DE TESTE", "Quadra do Bairro", artilheiro.nome.toUpperCase()]);
        // Destaque grande: quem fez gol mostra os gols, e o aproveitamento fica na linha de baixo.
        expect(valorAntesDe(textos, "GOLS NA PELADA")).to.eq(String(artilheiro.gols));
        expect(textos).to.include(`${aproveitamento}% de aproveitamento`);
        // Grade 2 x 2: cada rotulo vem depois do numero certo.
        expect(valorAntesDe(textos, "PARTIDAS")).to.eq(String(artilheiro.jogos));
        expect(valorAntesDe(textos, "VITÓRIAS")).to.eq(String(artilheiro.vitorias));
        expect(valorAntesDe(textos, "GOLS")).to.eq(String(artilheiro.gols));
        expect(valorAntesDe(textos, "ASSISTÊNCIAS")).to.eq(String(artilheiro.assistencias));
        // Selos: ARTILHEIRO sempre; MVP so se a pagina de estatisticas mostrou; INVICTO nao (perdeu a ultima).
        expect(textos).to.include("ARTILHEIRO");
        expect(textos.includes("MVP"), "MVP igual ao da pagina de estatisticas").to.eq(eMvp);
        expect(textos).not.to.include("INVICTO");
        // Sem foto: as iniciais no lugar, e nenhuma imagem de 400 px.
        expect(textos).to.include(iniciais(artilheiro.nome));
        expect(imagens.filter((imagem) => imagem.destinoLargura === 400)).to.have.length(0);
        expect(textos).to.include(ASSINATURA_DO_STORY);
      });
    });
  });

  it("quem nao fez gol nem venceu: o destaque vira partidas jogadas, sem aproveitamento e sem selo de artilheiro", () => {
    cy.entrarComo(semGol.username);
    cy.visit(`/game-days/${gameDayId}`, { onBeforeLoad: espiarCanvas });
    cy.findByRole("button", { name: /Compartilhar meu desempenho/ }).click();
    esperarStoryPronto();
    cy.window().then((win) => {
      const { textos } = registroDe(win);
      expect(textos).to.include(semGol.nome.toUpperCase());
      expect(valorAntesDe(textos, "PARTIDA JOGADA")).to.eq(String(semGol.jogos));
      expect(textos.some((texto) => /aproveitamento/.test(texto)), "linha de aproveitamento").to.eq(false);
      expect(valorAntesDe(textos, "VITÓRIAS")).to.eq("0");
      expect(valorAntesDe(textos, "GOLS")).to.eq("0");
      expect(valorAntesDe(textos, "ASSISTÊNCIAS")).to.eq("0");
      expect(textos).not.to.include("ARTILHEIRO");
      expect(textos).not.to.include("INVICTO");
      expect(textos).to.include(iniciais(semGol.nome));
    });
  });

  it("baixar entrega um PNG 1080 x 1920 com o nome do jogador no arquivo", () => {
    cy.entrarComo(artilheiro.username);
    cy.visit(`/game-days/${gameDayId}`);
    cy.findByRole("button", { name: /Compartilhar meu desempenho/ }).click();
    cy.get("canvas").should(($canvas) => expect(($canvas[0] as HTMLCanvasElement).width).to.eq(1080));
    cy.findByText("Gerando...").should("not.exist");
    cy.findByRole("button", { name: /Baixar imagem/ }).should("be.enabled").click();
    const arquivo = `voacraque-${artilheiro.nome.toLowerCase().replace(/\s+/g, "-")}.png`;
    cy.readFile(`cypress/downloads/${arquivo}`, null, { timeout: 15_000 }).should((bytes) => {
      const { largura, altura } = dimensoesDoPng(bytes as Uint8Array);
      expect({ largura, altura }).to.deep.equal({ largura: 1080, altura: 1920 });
      expect((bytes as Uint8Array).length).to.be.greaterThan(20_000);
    });
  });

  it("com Web Share, Compartilhar entrega o PNG, o titulo e o texto da pelada ao celular", () => {
    cy.entrarComo(artilheiro.username);
    cy.visit(`/game-days/${gameDayId}`, { onBeforeLoad: comWebShare });
    cy.findByRole("button", { name: /Compartilhar meu desempenho/ }).click();
    esperarStoryPronto();
    cy.findByRole("button", { name: "Baixar" }).should("be.enabled");
    cy.findByRole("button", { name: "Compartilhar" }).should("be.enabled").click();

    cy.get("@share").should("have.been.calledOnce");
    cy.get<sinon.SinonStub>("@share").then((stub) => {
      const [dados] = stub.firstCall.args as [{ files: File[]; title: string; text: string }];
      expect(dados.title).to.eq("Meu desempenho na pelada");
      expect(dados.text).to.contain("Pelada de teste");
      expect(dados.files).to.have.length(1);
      const [arquivo] = dados.files;
      expect(arquivo.name).to.eq(`voacraque-${artilheiro.nome.toLowerCase().replace(/\s+/g, "-")}.png`);
      expect(arquivo.type).to.eq("image/png");
      expect(arquivo.size).to.be.greaterThan(20_000);
      // O arquivo entregue e o cartao de verdade, nao um arquivo qualquer.
      cy.window()
        .then((win) => win.createImageBitmap(arquivo))
        .then((bitmap) => {
          expect({ largura: bitmap.width, altura: bitmap.height }).to.deep.equal({ largura: 1080, altura: 1920 });
        });
    });
  });

  it("so quem jogou ve o botao: quem nao jogou, o visitante e a pelada ainda ao vivo ficam sem ele", () => {
    // Cadastrado e fora da pelada.
    cy.entrarComo("jogador13");
    cy.visit(`/game-days/${gameDayId}`);
    cy.findByRole("link", { name: /Ver estatísticas da pelada/ }).should("be.visible");
    cy.findByRole("button", { name: /Compartilhar meu desempenho/ }).should("not.exist");

    // Visitante: o site e aberto a visitantes no cenario.
    cy.clearCookies();
    cy.visit(`/game-days/${gameDayId}`);
    cy.findByRole("link", { name: /Ver estatísticas da pelada/ }).should("be.visible");
    cy.findByRole("button", { name: /Compartilhar meu desempenho/ }).should("not.exist");

    // Antes de encerrar nao ha story: so existe depois da pelada.
    cy.cenario("ao-vivo").then(({ gameDayId: aoVivoId }) => {
      cy.entrarComo("jogador01");
      cy.visit(`/game-days/${aoVivoId}`);
      cy.findByRole("link", { name: /Acompanhar ao vivo/ }).should("be.visible");
      cy.findByRole("button", { name: /Compartilhar meu desempenho/ }).should("not.exist");
    });
  });
});
