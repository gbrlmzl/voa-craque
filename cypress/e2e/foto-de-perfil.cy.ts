import {
  amostrar,
  conferirGradienteDaFoto,
  esperarStoryPronto,
  espiarCanvas,
  FOTO_DO_STORY,
  iniciais,
  registroDe,
} from "../support/story";

type Esperado = import("../tasks/cenarios").EsperadoJogador;

// tests/helpers/fixtures/foto.jpg: 3000 x 2000 (paisagem), ~120 KB, com gradiente de vermelho na horizontal e de verde na vertical.
const FOTO_DE_TESTE = "tests/helpers/fixtures/foto.jpg";
const ORIGINAL_EM_BYTES = 121_850;
const LADO_GRAVADO = 512;

describe("Foto de perfil: do envio a todos os lugares em que ela aparece", () => {
  let gameDayId: string;
  let jogador: Esperado;
  let outro: Esperado;

  /** Envia a foto pelo formulario do perfil e devolve a URL que o app passou a servir. */
  function enviarFoto(): Cypress.Chainable<string> {
    cy.visit("/profile");
    cy.findByRole("button", { name: "Editar dados" }).click();
    cy.get('input[type="file"]').selectFile(FOTO_DE_TESTE, { force: true });
    cy.findByRole("button", { name: "Salvar alterações" }).click();
    cy.findByRole("status").should("contain.text", "Perfil atualizado.");
    return cy
      .findByRole("button", { name: "Ver foto em tamanho maior" })
      .find("img")
      .should("have.attr", "src")
      .and("match", /^\/api\/files\/fotos\/[0-9a-f-]+\.webp$/)
      .then((src) => src as unknown as string);
  }

  beforeEach(() => {
    cy.cenario("destaques").then(({ gameDayId: id, dados }) => {
      gameDayId = id!;
      jogador = dados!.jogadores[dados!.artilheiros[0]];
      outro = Object.values(dados!.jogadores).find((j) => j.username !== jogador.username)!;
    });
  });

  it("o arquivo gravado e um WebP quadrado de 512 px, recortado no centro, sem girar nem espelhar, bem menor que o original", () => {
    cy.entrarComo(jogador.username);
    enviarFoto().then((src) => {
      cy.request({ url: src, encoding: "binary" }).then((resposta) => {
        expect(resposta.status).to.eq(200);
        expect(resposta.headers["content-type"]).to.eq("image/webp");
        expect(resposta.headers["cache-control"]).to.contain("immutable");
        // RIFF....WEBP: e WebP de verdade, nao o JPEG renomeado.
        expect(resposta.body.slice(0, 4)).to.eq("RIFF");
        expect(resposta.body.slice(8, 12)).to.eq("WEBP");
        expect(resposta.body.length, "bytes do WebP").to.be.lessThan(ORIGINAL_EM_BYTES / 2);
      });

      cy.get(`img[src="${src}"]`)
        .first()
        .should(($img) => {
          const imagem = $img[0] as HTMLImageElement;
          expect({ largura: imagem.naturalWidth, altura: imagem.naturalHeight }).to.deep.equal({
            largura: LADO_GRAVADO,
            altura: LADO_GRAVADO,
          });
        })
        .then(($img) => {
          cy.window().then((win) => {
            const imagem = $img[0] as HTMLImageElement;
            // Foto paisagem: o recorte e o quadrado central, nao uma imagem esticada.
            conferirGradienteDaFoto({
              esquerda: amostrar(win, imagem, 20, 256),
              direita: amostrar(win, imagem, 492, 256),
              topo: amostrar(win, imagem, 256, 20),
              base: amostrar(win, imagem, 256, 492),
            });
          });
        });
    });
  });

  it("a mesma foto aparece no perfil, no menu da conta, no ranking e na pagina publica de estatisticas", () => {
    cy.entrarComo(jogador.username);
    enviarFoto().then((src) => {
      const daFoto = `img[alt="${jogador.nome}"][src="${src}"]`;
      const carregada = ($img: JQuery<HTMLElement>) => {
        const imagem = $img[0] as HTMLImageElement;
        expect(imagem.naturalWidth, "foto decodificada").to.eq(LADO_GRAVADO);
      };

      // Perfil: a foto grande e a miniatura do cabecalho (que existe em mais de um layout).
      cy.get(daFoto).should("have.length.gte", 2);
      cy.get(daFoto).first().should(carregada);

      // Ranking: a linha do jogador e, ao abrir a ficha, o avatar grande.
      cy.visit("/ranking");
      cy.contains("button", jogador.nome).find(daFoto).should("be.visible").and(carregada);
      cy.contains("button", jogador.nome).click();
      cy.findByRole("dialog").find(daFoto).should("be.visible").and(carregada);

      // A pagina de estatisticas e publica: o visitante ve a foto, e os demais seguem com as iniciais.
      cy.clearCookies();
      cy.visit(`/game-days/${gameDayId}/stats`);
      cy.contains("span.truncate", jogador.nome).closest("div.rounded-xl").find(daFoto).should("be.visible").and(carregada);
      cy.contains("span.truncate", outro.nome).closest("div.rounded-xl").within(() => {
        cy.get("img").should("not.exist");
        cy.contains(iniciais(outro.nome)).should("be.visible");
      });
    });
  });

  it("o story do jogador usa a foto dele: a imagem de 512 px vai para o quadrado de 400 px do cartao", () => {
    cy.entrarComo(jogador.username);
    enviarFoto();
    cy.visit(`/game-days/${gameDayId}`, { onBeforeLoad: espiarCanvas });
    cy.findByRole("button", { name: /Compartilhar meu desempenho/ }).click();
    esperarStoryPronto();

    cy.window().then((win) => {
      const { textos, imagens } = registroDe(win);
      const fotos = imagens.filter((imagem) => imagem.destinoLargura === FOTO_DO_STORY.lado);
      expect(fotos, "foto desenhada no quadrado de 400 px").to.have.length(1);
      expect(fotos[0]).to.include({ naturalLargura: LADO_GRAVADO, naturalAltura: LADO_GRAVADO, destinoAltura: FOTO_DO_STORY.lado });
      // Com foto, as iniciais nao aparecem.
      expect(textos).not.to.include(iniciais(jogador.nome));

      // E o PNG mostra a foto de verdade: o gradiente do recorte nas duas bordas do quadrado.
      const canvas = win.document.querySelector("canvas")!;
      const meio = FOTO_DO_STORY.y + FOTO_DO_STORY.lado / 2;
      const centro = FOTO_DO_STORY.x + FOTO_DO_STORY.lado / 2;
      const fim = FOTO_DO_STORY.lado - 24;
      // Os selos (ARTILHEIRO, MVP) cobrem a base da foto a partir de y = 848: a amostra de baixo fica acima deles.
      const baixo = FOTO_DO_STORY.lado - 60;
      conferirGradienteDaFoto({
        esquerda: amostrar(win, canvas, FOTO_DO_STORY.x + 24, meio),
        direita: amostrar(win, canvas, FOTO_DO_STORY.x + fim, meio),
        topo: amostrar(win, canvas, centro, FOTO_DO_STORY.y + 24),
        base: amostrar(win, canvas, centro, FOTO_DO_STORY.y + baixo),
      });
    });
  });
});
