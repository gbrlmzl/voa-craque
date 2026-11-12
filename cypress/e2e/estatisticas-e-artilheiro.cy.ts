import { esperarStoryPronto, espiarCanvas, registroDe } from "../support/story";

type Dados = NonNullable<import("../tasks/cenarios").DadosDestaques>;

// Os numeros esperados vem do script do cenario ("destaques", em cypress/tasks/cenarios.ts), que conta cada
// gol, assistencia e resultado enquanto os registra. Nada aqui recalcula estatistica com a regra do app.

const plural = (quantos: number, um: string, varios: string) => `${quantos} ${quantos === 1 ? um : varios}`;
const linhaDoJogador = (nome: string) => cy.contains("span.truncate", nome).closest("div.rounded-xl");

describe("Estatisticas da pelada e selo de artilheiro", () => {
  let gameDayId: string;
  let dados: Dados;

  describe("com um unico artilheiro", () => {
    beforeEach(() => {
      cy.cenario("destaques").then((resultado) => {
        gameDayId = resultado.gameDayId!;
        dados = resultado.dados!;
      });
    });

    it("o cenario tem o placar que o teste espera: 12 jogadores e um artilheiro com 3 gols", () => {
      expect(Object.keys(dados.jogadores)).to.have.length(12);
      expect(dados.maximoDeGols).to.eq(3);
      expect(dados.artilheiros).to.have.length(1);
      // 3 partidas: cada time joga 1 a 3 vezes e todo jogo tem um vencedor, entao vitorias + derrotas = jogos.
      for (const jogador of Object.values(dados.jogadores)) {
        expect(jogador.vitorias + jogador.derrotas).to.eq(jogador.jogos);
      }
    });

    it("cada jogador aparece com jogos, vitorias, aproveitamento, gols e assistencias certos", () => {
      cy.visit(`/game-days/${gameDayId}/stats`);
      cy.contains("12 jogadores").should("be.visible");
      for (const jogador of Object.values(dados.jogadores)) {
        const aproveitamento = Math.round((jogador.vitorias / jogador.jogos) * 100);
        linhaDoJogador(jogador.nome).should(($linha) => {
          const texto = $linha.text();
          expect(texto, `${jogador.nome}: jogos, vitorias e aproveitamento`).to.contain(
            `${plural(jogador.jogos, "jogo", "jogos")} · ${plural(jogador.vitorias, "vitória", "vitórias")} · ${aproveitamento}%`,
          );
          expect(texto, `${jogador.nome}: gols`).to.contain(`${jogador.gols} gols`);
          expect(texto, `${jogador.nome}: assistencias`).to.contain(`${jogador.assistencias} assist.`);
        });
      }
    });

    it("a lista vem ordenada por gols e o primeiro e o artilheiro", () => {
      cy.visit(`/game-days/${gameDayId}/stats`);
      cy.get("div.rounded-xl").should("have.length", 12);
      cy.get("div.rounded-xl").then(($linhas) => {
        const gols = [...$linhas].map((linha) => Number(/(\d+) gols/.exec(linha.textContent ?? "")?.[1]));
        expect(gols).to.deep.equal([...gols].sort((a, b) => b - a));
        expect(gols[0]).to.eq(dados.maximoDeGols);
      });
      cy.get("div.rounded-xl").first().should("contain.text", dados.jogadores[dados.artilheiros[0]].nome);
    });

    it("so o artilheiro leva o selo: quem fez 3 gols, e ninguem mais, mesmo quem fez 2", () => {
      const artilheiro = dados.jogadores[dados.artilheiros[0]];
      cy.visit(`/game-days/${gameDayId}/stats`);
      cy.findAllByLabelText("Artilheiro").should("have.length", 1);
      linhaDoJogador(artilheiro.nome).find('[aria-label="Artilheiro"]').should("be.visible");
      // Quem fez 2 ou menos fica sem o selo.
      for (const jogador of Object.values(dados.jogadores).filter((j) => j.username !== artilheiro.username)) {
        linhaDoJogador(jogador.nome).find('[aria-label="Artilheiro"]').should("not.exist");
      }
    });

    it("o selo e o numero chegam iguais ao ranking: Artilharia e Assistencias, e a ficha do jogador", () => {
      const artilheiro = dados.jogadores[dados.artilheiros[0]];
      cy.visit("/ranking");

      cy.findByRole("button", { name: "Artilharia" }).click();
      cy.get("button.rounded-xl").first().should("contain.text", artilheiro.nome);
      for (const jogador of Object.values(dados.jogadores)) {
        cy.contains("button", jogador.nome).find("span.text-lg").should("have.text", String(jogador.gols));
      }

      cy.findByRole("button", { name: "Assistências" }).click();
      for (const jogador of Object.values(dados.jogadores)) {
        cy.contains("button", jogador.nome).find("span.text-lg").should("have.text", String(jogador.assistencias));
      }

      cy.contains("button", artilheiro.nome).click();
      cy.findByRole("dialog").within(() => {
        const valorDe = (rotulo: string) => cy.contains("p", new RegExp(`^${rotulo}$`)).prev("p");
        valorDe("Gols").should("have.text", String(artilheiro.gols));
        valorDe("Assist.").should("have.text", String(artilheiro.assistencias));
        valorDe("Jogos").should("have.text", String(artilheiro.jogos));
        valorDe("Vitórias").should("have.text", String(artilheiro.vitorias));
        // O extrato da pelada (MMR) conta os mesmos gols, assistencias e jogos.
        cy.findByRole("button", { name: /Histórico/ }).click();
        cy.contains(
          `${artilheiro.gols}G ${artilheiro.assistencias}A · ${plural(artilheiro.jogos, "jogo", "jogos")}`,
        ).should("be.visible");
      });
    });
  });

  describe("com empate na artilharia", () => {
    beforeEach(() => {
      cy.cenario("destaques-empate").then((resultado) => {
        gameDayId = resultado.gameDayId!;
        dados = resultado.dados!;
      });
    });

    it("quem empata no maximo de gols leva o selo, e so eles", () => {
      expect(dados.maximoDeGols).to.eq(2);
      expect(dados.artilheiros).to.have.length(3);

      cy.visit(`/game-days/${gameDayId}/stats`);
      cy.findAllByLabelText("Artilheiro").should("have.length", 3);
      for (const jogador of Object.values(dados.jogadores)) {
        const ehArtilheiro = dados.artilheiros.includes(jogador.username);
        linhaDoJogador(jogador.nome)
          .find('[aria-label="Artilheiro"]')
          .should(ehArtilheiro ? "be.visible" : "not.exist");
        if (ehArtilheiro) linhaDoJogador(jogador.nome).should("contain.text", `${dados.maximoDeGols} gols`);
      }
    });

    it("o story de quem empatou leva o selo ARTILHEIRO; o de quem nao empatou, nao", () => {
      const empatado = dados.jogadores[dados.artilheiros[0]];
      const fora = Object.values(dados.jogadores).find((j) => !dados.artilheiros.includes(j.username))!;

      cy.entrarComo(empatado.username);
      cy.visit(`/game-days/${gameDayId}`, { onBeforeLoad: espiarCanvas });
      // A chama no proprio botao (alem da camera) avisa que e artilheiro.
      cy.findByRole("button", { name: /Compartilhar meu desempenho/ }).find("svg").should("have.length", 2);
      cy.findByRole("button", { name: /Compartilhar meu desempenho/ }).click();
      esperarStoryPronto();
      cy.window().then((win) => expect(registroDe(win).textos).to.include("ARTILHEIRO"));

      cy.entrarComo(fora.username);
      cy.visit(`/game-days/${gameDayId}`, { onBeforeLoad: espiarCanvas });
      cy.findByRole("button", { name: /Compartilhar meu desempenho/ }).find("svg").should("have.length", 1);
      cy.findByRole("button", { name: /Compartilhar meu desempenho/ }).click();
      esperarStoryPronto();
      cy.window().then((win) => expect(registroDe(win).textos).not.to.include("ARTILHEIRO"));
    });
  });
});
