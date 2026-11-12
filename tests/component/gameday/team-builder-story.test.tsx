import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareStoryButton } from "@/components/gameday/ShareStoryButton";
import { TeamBuilder, type BuilderPlayer, type BuilderTeam } from "@/components/gameday/TeamBuilder";
import { installFakeCanvas } from "../../helpers/fake-canvas";
import { fetchCallsTo, mockFetch } from "../../helpers/fetch-mock";
import { router } from "../../helpers/next-navigation";
import { ADMIN, renderWithProviders } from "../../helpers/render";

const players = (n: number, overrides: Partial<BuilderPlayer> = {}): BuilderPlayer[] =>
  Array.from({ length: n }, (_, i) => ({
    userId: `u${i + 1}`,
    name: `Jogador ${i + 1}`,
    photoUrl: null,
    stars: 3,
    positionLabel: "Ala",
    isKeeper: i === 0,
    paymentStatus: "CONFIRMED" as const,
    ...overrides,
  }));

const teamsFor = (pool: BuilderPlayer[], size: number): BuilderTeam[] => [
  { name: "A", averageStrength: 52.3, playerIds: pool.slice(0, size).map((p) => p.userId) },
  { name: "B", averageStrength: 51.9, playerIds: pool.slice(size, size * 2).map((p) => p.userId) },
];

function builder(props: Partial<React.ComponentProps<typeof TeamBuilder>> = {}, teamLabelMode: "letters" | "numbers" = "letters") {
  const pool = props.pool ?? players(9);
  return renderWithProviders(
    <TeamBuilder gameDayId="g1" teamSize={4} pool={pool} teams={[]} reserveIds={[]} locked={false} {...props} />,
    { user: ADMIN, teamLabelMode },
  );
}

describe("TeamBuilder", () => {
  it("resumo do grupo: inscritos, times que cabem e reserva; sorteio desabilitado sem gente para dois times", async () => {
    builder();
    expect(await screen.findByText("9 jogadores inscritos")).toBeInTheDocument();
    expect(screen.getByText("Dá 2 times de 4 e 1 na reserva.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sortear times/ })).toBeEnabled();
  });

  it("menos de dois times: botao desabilitado e explicacao", async () => {
    builder({ pool: players(6) });
    expect(await screen.findByRole("button", { name: /Sortear times/ })).toBeDisabled();
    expect(screen.getByText("São necessários 8 inscritos para formar dois times.")).toBeInTheDocument();
  });

  it("avisa quem esta sem avaliacao", async () => {
    builder({ pool: [...players(7), { ...players(1)[0], userId: "x", stars: null }] });
    expect(await screen.findByText(/1 jogador entra sem avaliação/)).toBeInTheDocument();
    builder({ pool: players(8).map((p, i) => (i < 2 ? { ...p, stars: null } : p)) });
    expect(await screen.findByText(/2 jogadores entram sem avaliação/)).toBeInTheDocument();
  });

  it("sortear chama a API e avisa com a diferenca de forca", async () => {
    mockFetch({
      "POST /api/game-days/g1/teams/draw": { body: { teams: [{}, {}], spread: 0.4 } },
    });
    builder({ pool: players(8) });
    await userEvent.click(await screen.findByRole("button", { name: /Sortear times/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("2 times sorteados. Diferença de força: 0.4.");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("erro do sorteio vira toast de erro", async () => {
    mockFetch({ "POST /api/game-days/g1/teams/draw": { status: 409, body: { error: "A pelada já começou. Não dá para remontar os times agora." } } });
    builder({ pool: players(8) });
    await userEvent.click(await screen.findByRole("button", { name: /Sortear times/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("A pelada já começou");
  });

  it("com times montados: resultado do sorteio, link do painel e 'Sortear de novo'", async () => {
    const pool = players(8);
    builder({ pool, teams: teamsFor(pool, 4) });
    expect(await screen.findByText("2 times montados")).toBeInTheDocument();
    expect(screen.getByText("52.3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Painel/ })).toHaveAttribute("href", "/game-days/g1");
    expect(screen.getByRole("button", { name: /Sortear de novo/ })).toBeInTheDocument();
    expect(screen.getByText("A: 4/4")).toBeInTheDocument();
    expect(screen.getByText("Reserva: 0")).toBeInTheDocument();
  });

  it("travado: so avisa que a pelada ja comecou", async () => {
    builder({ locked: true });
    expect(await screen.findByText(/A pelada já começou. Os times ficam como estão/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sortear/ })).toBeNull();
  });

  it("ajuste manual: mover jogador atualiza contagens, habilita salvar e envia a escalacao", async () => {
    mockFetch({ "PUT /api/game-days/g1/teams": { body: { ok: true } } });
    const pool = players(8);
    builder({ pool, teams: teamsFor(pool, 4) });
    const save = await screen.findByRole("button", { name: /Salvar escalação/ });
    expect(save).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText("Time de Jogador 1"), "RESERVA");
    expect(screen.getByText("A: 3/4")).toBeInTheDocument();
    expect(screen.getByText("Reserva: 1")).toBeInTheDocument();
    expect(save).toBeEnabled();

    await userEvent.click(save);
    expect(await screen.findByRole("status")).toHaveTextContent("Times salvos.");
    const body = fetchCallsTo("PUT", "/api/game-days/g1/teams")[0].body as { teams: { name: string; playerIds: string[] }[]; reserveIds: string[] };
    expect(body.teams[0]).toEqual({ name: "A", playerIds: ["u2", "u3", "u4"] });
    expect(body.reserveIds).toEqual(["u1"]);
  });

  it("time acima do limite: aviso e salvar bloqueado", async () => {
    const pool = players(8);
    builder({ pool, teams: teamsFor(pool, 4) });
    await userEvent.selectOptions(await screen.findByLabelText("Time de Jogador 5"), "A");
    expect(screen.getByText("Time A passou de 4 jogadores.")).toBeInTheDocument();
    expect(screen.getByText("A: 5/4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salvar escalação/ })).toBeDisabled();
  });

  it("erro ao salvar aparece como toast", async () => {
    mockFetch({ "PUT /api/game-days/g1/teams": { status: 400, body: { error: "O mesmo jogador foi colocado em dois lugares." } } });
    const pool = players(8);
    builder({ pool, teams: teamsFor(pool, 4) });
    await userEvent.selectOptions(await screen.findByLabelText("Time de Jogador 1"), "RESERVA");
    await userEvent.click(screen.getByRole("button", { name: /Salvar escalação/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("O mesmo jogador foi colocado em dois lugares.");
  });

  it("modo numerico: Time 1 e Time 2 nos seletores e no resultado", async () => {
    const pool = players(8);
    builder({ pool, teams: teamsFor(pool, 4) }, "numbers");
    const first = await screen.findByLabelText("Time de Jogador 1");
    expect(within(first).getByRole("option", { name: "Time 1" })).toBeInTheDocument();
    expect(within(first).getByRole("option", { name: "Time 2" })).toBeInTheDocument();
    expect(screen.getByText("1: 4/4")).toBeInTheDocument();
  });

  it("se o servidor mandar times novos (sorteio), a escalacao local acompanha", async () => {
    const pool = players(8);
    const { rerender } = builder({ pool, teams: teamsFor(pool, 4) });
    await screen.findByText("A: 4/4");
    await userEvent.selectOptions(screen.getByLabelText("Time de Jogador 1"), "RESERVA");
    expect(screen.getByText("A: 3/4")).toBeInTheDocument();
    const redrawn: BuilderTeam[] = [
      { name: "A", averageStrength: 50, playerIds: ["u5", "u6", "u7", "u8"] },
      { name: "B", averageStrength: 50, playerIds: ["u1", "u2", "u3", "u4"] },
    ];
    rerender(<TeamBuilder gameDayId="g1" teamSize={4} pool={pool} teams={redrawn} reserveIds={[]} locked={false} />);
    await waitFor(() => expect(screen.getByText("A: 4/4")).toBeInTheDocument());
    expect(screen.getByText("Reserva: 0")).toBeInTheDocument();
  });
});

describe("ShareStoryButton", () => {
  const stats = {
    userId: "u1",
    name: "Gabriel Souza",
    nickname: null,
    photoUrl: null,
    played: 3,
    won: 2,
    drawn: 0,
    lost: 1,
    winRate: 0.66,
    goals: 4,
    assists: 1,
    topScorer: true,
    mvp: false,
    mmrDelta: null,
  };
  const gameDay = { title: "Pelada de sexta", scheduledAt: "2030-05-10T20:00:00.000Z", location: "Quadra" };
  let canvas: ReturnType<typeof installFakeCanvas>;
  beforeEach(() => {
    canvas = installFakeCanvas();
    mockFetch({ "GET /icon.svg": { body: "x" } });
  });
  afterEach(() => {
    canvas.restore();
    delete (navigator as unknown as Record<string, unknown>).share;
    delete (navigator as unknown as Record<string, unknown>).canShare;
  });

  it("abre o modal, desenha o card e oferece so 'Baixar imagem' sem Web Share", async () => {
    renderWithProviders(<ShareStoryButton gameDay={gameDay} stats={stats} />);
    await userEvent.click(await screen.findByRole("button", { name: /Compartilhar meu desempenho/ }));
    expect(screen.getByRole("dialog", { name: "Seu story da pelada" })).toBeInTheDocument();
    await waitFor(() => expect(canvas.calls.length).toBeGreaterThan(30));
    expect(await screen.findByRole("button", { name: /Baixar imagem/ })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /^Compartilhar$/ })).toBeNull();
  });

  it("baixar gera o PNG pelo canvas e dispara o download com o nome do jogador", async () => {
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderWithProviders(<ShareStoryButton gameDay={gameDay} stats={stats} />);
    await userEvent.click(await screen.findByRole("button", { name: /Compartilhar meu desempenho/ }));
    await userEvent.click(await screen.findByRole("button", { name: /Baixar imagem/ }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("com Web Share de arquivos: baixa ou compartilha o PNG", async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share, canShare: () => true });
    renderWithProviders(<ShareStoryButton gameDay={gameDay} stats={stats} />);
    await userEvent.click(await screen.findByRole("button", { name: /Compartilhar meu desempenho/ }));
    await userEvent.click(await screen.findByRole("button", { name: /^Compartilhar$/ }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const arg = share.mock.calls[0][0];
    expect(arg.files[0].name).toBe("voacraque-gabriel-souza.png");
    expect(arg.title).toBe("Meu desempenho na pelada");
    expect(arg.text).toContain("Pelada de sexta");
  });

  it("cancelar o compartilhamento nao e erro; falha de verdade mostra o aviso", async () => {
    const share = jest.fn().mockRejectedValueOnce(Object.assign(new Error("cancelou"), { name: "AbortError" })).mockRejectedValueOnce(new Error("falhou"));
    Object.assign(navigator, { share, canShare: () => true });
    renderWithProviders(<ShareStoryButton gameDay={gameDay} stats={stats} />);
    await userEvent.click(await screen.findByRole("button", { name: /Compartilhar meu desempenho/ }));
    await userEvent.click(await screen.findByRole("button", { name: /^Compartilhar$/ }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("status")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /^Compartilhar$/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("Não foi possível compartilhar");
  });

  it("canvas que nao exporta mostra erro", async () => {
    (HTMLCanvasElement.prototype.toBlob as jest.Mock).mockImplementation((cb: BlobCallback) => cb(null));
    renderWithProviders(<ShareStoryButton gameDay={gameDay} stats={stats} />);
    await userEvent.click(await screen.findByRole("button", { name: /Compartilhar meu desempenho/ }));
    await userEvent.click(await screen.findByRole("button", { name: /Baixar imagem/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("Não foi possível gerar a imagem.");
  });

  it("fecha o modal pelo X", async () => {
    renderWithProviders(<ShareStoryButton gameDay={gameDay} stats={{ ...stats, topScorer: false }} />);
    await userEvent.click(await screen.findByRole("button", { name: /Compartilhar meu desempenho/ }));
    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
