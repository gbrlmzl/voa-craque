// Apoio dos specs do story: o cartao e desenhado num <canvas> e o PNG e so pixels, entao o teste
// espia as chamadas de desenho do navegador (texto e imagem) e amostra pixels do canvas. Nada disso
// muda o app: e so um espiao instalado na janela do app antes de ela carregar.

export type ImagemDesenhada = {
  naturalLargura: number;
  naturalAltura: number;
  /** Tamanho em que foi pintada no cartao (a foto de perfil e 400 x 400; o logo, 56 x 56). */
  destinoLargura: number;
  destinoAltura: number;
};

export type RegistroCanvas = { textos: string[]; imagens: ImagemDesenhada[] };

/** "J0" para "Jogador 05": a regra das iniciais do app (primeira letra do primeiro e do ultimo nome). */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0][0] ?? "?") + (partes.length > 1 ? partes.at(-1)![0] : "")).toUpperCase();
}

/** Ultimo texto que o cartao desenha: quando ele aparece, o story terminou de ser pintado. */
export const ASSINATURA_DO_STORY = "voacraque.gabrielmizael.com";

/** Geometria do cartao (src/lib/story-card.ts): a foto e um quadrado de 400 px centrado, a partir de y = 476. */
export const FOTO_DO_STORY = { x: 340, y: 476, lado: 400 } as const;

type Chamada = (this: CanvasRenderingContext2D, ...args: unknown[]) => unknown;

/** Use em `cy.visit(url, { onBeforeLoad: espiarCanvas })`. */
export function espiarCanvas(win: Cypress.AUTWindow) {
  const registro: RegistroCanvas = { textos: [], imagens: [] };
  const proto = win.CanvasRenderingContext2D.prototype as unknown as Record<string, Chamada>;

  const fillText = proto.fillText;
  proto.fillText = function (...args) {
    registro.textos.push(String(args[0]));
    return fillText.apply(this, args);
  };

  const drawImage = proto.drawImage;
  proto.drawImage = function (...args) {
    const image = args[0];
    if (image instanceof win.HTMLImageElement) {
      // drawImage(img, dx, dy, dw, dh) ou drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh).
      registro.imagens.push({
        naturalLargura: image.naturalWidth,
        naturalAltura: image.naturalHeight,
        destinoLargura: Number(args[args.length - 2]),
        destinoAltura: Number(args[args.length - 1]),
      });
    }
    return drawImage.apply(this, args);
  };

  (win as unknown as { __story: RegistroCanvas }).__story = registro;
}

export function registroDe(win: Cypress.AUTWindow): RegistroCanvas {
  return (win as unknown as { __story: RegistroCanvas }).__story;
}

/** Espera o cartao inteiro ser pintado (a assinatura e a ultima chamada de desenho). */
export function esperarStoryPronto() {
  return cy.window().should((win) => {
    expect(registroDe(win).textos, "cartao do story desenhado ate a assinatura").to.include(ASSINATURA_DO_STORY);
  });
}

/** O texto desenhado logo antes de `rotulo`: o cartao sempre pinta o numero e depois o rotulo dele. */
export function valorAntesDe(textos: string[], rotulo: string): string {
  const posicao = textos.indexOf(rotulo);
  expect(posicao, `rotulo "${rotulo}" desenhado`).to.be.greaterThan(0);
  return textos[posicao - 1];
}

/** Dimensoes de um PNG, lidas do cabecalho IHDR (bytes 16 a 23, big-endian). */
export function dimensoesDoPng(bytes: Uint8Array): { largura: number; altura: number } {
  const assinatura = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  expect([...bytes.slice(0, 8)], "assinatura PNG").to.deep.equal(assinatura);
  const lerInt = (inicio: number) =>
    ((bytes[inicio] << 24) | (bytes[inicio + 1] << 16) | (bytes[inicio + 2] << 8) | bytes[inicio + 3]) >>> 0;
  return { largura: lerInt(16), altura: lerInt(20) };
}

/** Cor [r, g, b] do pixel (x, y) de um canvas ou de uma imagem ja carregada na janela do app. */
export function amostrar(
  win: Cypress.AUTWindow,
  origem: HTMLCanvasElement | HTMLImageElement,
  x: number,
  y: number,
): [number, number, number] {
  let canvas: HTMLCanvasElement;
  if (origem instanceof win.HTMLCanvasElement) {
    canvas = origem;
  } else {
    canvas = win.document.createElement("canvas");
    canvas.width = (origem as HTMLImageElement).naturalWidth;
    canvas.height = (origem as HTMLImageElement).naturalHeight;
    canvas.getContext("2d")!.drawImage(origem as HTMLImageElement, 0, 0);
  }
  const [r, g, b] = canvas.getContext("2d")!.getImageData(x, y, 1, 1).data;
  return [r, g, b];
}

/**
 * A foto de teste (tests/helpers/fixtures/foto.jpg) e 3000 x 2000 com o vermelho crescendo da borda esquerda
 * (R = 0) para a direita (R = 255) e o verde crescendo de cima (G = 0) para baixo (G = 255); o azul varia em
 * padrao proprio e nao e usado. O app recorta o quadrado central (x de 500 a 2500) sem cortar na altura.
 * Medido no arquivo original nos pontos que correspondem ao recorte: R = 50 na borda esquerda e 207 na direita,
 * G = 8 no topo, 129 no meio e 245 na base. Esticada em vez de recortada, a esquerda daria R perto de 10;
 * girada ou espelhada, o verde ou o vermelho inverteriam.
 */
export function conferirGradienteDaFoto(
  { esquerda, direita, topo, base }: { esquerda: number[]; direita: number[]; topo: number[]; base: number[] },
) {
  expect(esquerda[0], "vermelho na borda esquerda do recorte").to.be.within(36, 68);
  expect(direita[0], "vermelho na borda direita do recorte").to.be.within(188, 225);
  expect(topo[1], "verde no topo").to.be.within(0, 45);
  expect(base[1], "verde perto da base").to.be.within(185, 255);
  expect(esquerda[1], "verde no meio da altura").to.be.within(105, 150);
}
