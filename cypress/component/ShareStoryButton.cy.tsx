import { ShareStoryButton } from "@/components/gameday/ShareStoryButton";

const stats = {
  userId: "u1",
  name: "Gabriel Souza",
  nickname: "Gabi",
  photoUrl: null,
  played: 4,
  won: 3,
  drawn: 0,
  lost: 1,
  winRate: 0.75,
  goals: 5,
  assists: 2,
  topScorer: true,
  mvp: true,
  mmrDelta: null,
};
const gameDay = { title: "Pelada de sexta", scheduledAt: "2030-05-10T20:00:00.000Z", location: "Quadra do Bairro" };

describe("ShareStoryButton (canvas e toBlob reais)", () => {
  beforeEach(() => {
    cy.intercept("GET", "/icon.svg", { statusCode: 404, body: "" });
    // O navigator e o mesmo entre os testes do spec: cada um comeca sem Web Share.
    cy.window().then((win) => {
      Reflect.deleteProperty(win.navigator, "share");
      Reflect.deleteProperty(win.navigator, "canShare");
    });
  });

  it("gera um PNG 1080x1920 que nao esta vazio", () => {
    cy.mount(<ShareStoryButton gameDay={gameDay} stats={stats} />);
    cy.findByRole("button", { name: /Compartilhar meu desempenho/ }).click();
    cy.findByText("Gerando...").should("not.exist");
    cy.get("canvas").should(($canvas) => {
      const canvas = $canvas[0] as HTMLCanvasElement;
      expect(canvas.width).to.equal(1080);
      expect(canvas.height).to.equal(1920);
    });
    cy.get("canvas").then(($canvas) => {
      const canvas = $canvas[0] as HTMLCanvasElement;
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
      const distinct = new Set<number>();
      for (let i = 0; i < pixels.length; i += 4 * 997) distinct.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
      expect(distinct.size, "cores distintas amostradas").to.be.greaterThan(5);
      return new Cypress.Promise<void>((resolve) =>
        canvas.toBlob((blob) => {
          expect(blob!.type).to.equal("image/png");
          expect(blob!.size).to.be.greaterThan(20_000);
          resolve();
        }, "image/png"),
      );
    });
  });

  it("com Web Share de arquivos, 'Compartilhar' entrega o PNG ao navigator.share", () => {
    cy.window().then((win) => {
      Object.defineProperty(win.navigator, "canShare", { configurable: true, value: () => true });
      Object.defineProperty(win.navigator, "share", { configurable: true, value: cy.stub().as("share").resolves(undefined) });
    });
    cy.mount(<ShareStoryButton gameDay={gameDay} stats={stats} />);
    cy.findByRole("button", { name: /Compartilhar meu desempenho/ }).click();
    cy.findByRole("button", { name: /^Compartilhar$/ }).should("be.enabled").click();
    cy.get("@share").should("have.been.calledOnce");
    cy.get("@share").should((stub) => {
      const arg = (stub as unknown as sinon.SinonStub).firstCall.args[0];
      expect(arg.files[0].name).to.equal("voacraque-gabriel-souza.png");
      expect(arg.files[0].type).to.equal("image/png");
      expect(arg.files[0].size).to.be.greaterThan(20_000);
    });
  });

  it("sem Web Share so oferece baixar a imagem", () => {
    cy.mount(<ShareStoryButton gameDay={gameDay} stats={stats} />);
    cy.findByRole("button", { name: /Compartilhar meu desempenho/ }).click();
    cy.findByRole("button", { name: /Baixar imagem/ }).should("be.visible");
    cy.findByRole("button", { name: /^Compartilhar$/ }).should("not.exist");
  });
});
