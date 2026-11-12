import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { logoutAction } from "@/actions/auth";
import { AppShell } from "@/components/AppShell";
import { BrandIcon } from "@/components/BrandIcon";
import { LiveNowBanner } from "@/components/LiveNowBanner";
import { Avatar, PlayerChip, Stars, initialsOf } from "@/components/Player";
import { PlayerRatingCard } from "@/components/PlayerRatingCard";
import { RankingTable } from "@/components/RankingTable";
import {
  SkeletonBackLink,
  SkeletonBlock,
  SkeletonCard,
  SkeletonChipList,
  SkeletonForm,
  SkeletonListCard,
  SkeletonPageHeader,
  SkeletonScoreboard,
  SkeletonScreen,
  SkeletonSectionTitle,
  SkeletonTeamSummary,
  SkeletonText,
} from "@/components/Skeleton";
import { TeamName } from "@/components/TeamName";
import { UserAvatar } from "@/components/UserAvatar";
import { LIVE_BANNER_DISMISSED_KEY } from "@/lib/live-now";
import { mockFetch, fetchCallsTo } from "../../helpers/fetch-mock";
import { playerDetail, rankingRow, ratingDetail } from "../../helpers/fixtures-data";
import { setLocation } from "../../helpers/next-navigation";
import { ADMIN, PLAYER, renderWithProviders } from "../../helpers/render";

jest.mock("@/actions/auth", () => ({ logoutAction: jest.fn() }));

describe("AppShell", () => {
  it("visitante: aba e botao de Login levam ao login e voltam para a pagina atual", async () => {
    setLocation("/ranking", "a=1");
    renderWithProviders(<AppShell>conteudo</AppShell>, { user: null });
    const logins = await screen.findAllByRole("link", { name: /Login/ });
    expect(logins.length).toBeGreaterThanOrEqual(2);
    for (const link of logins) expect(link).toHaveAttribute("href", "/login?proximo=%2Franking%3Fa%3D1");
    expect(screen.queryByRole("button", { name: "Abrir menu" })).toBeNull();
    expect(screen.getByText("conteudo")).toBeInTheDocument();
  });

  it("logado: tab bar com Perfil, aba ativa pela rota e avatar abrindo a gaveta", async () => {
    setLocation("/game-days/g1");
    renderWithProviders(<AppShell>x</AppShell>, { user: PLAYER });
    expect(await screen.findByRole("button", { name: "Abrir menu" })).toBeInTheDocument();

    const bottom = screen.getAllByRole("navigation").at(-1)!;
    expect(within(bottom).getByRole("link", { name: "Perfil" })).toHaveAttribute("href", "/profile");
    expect(within(bottom).getByRole("link", { name: "Peladas" })).toHaveClass("text-pitch-400");
    expect(within(bottom).getByRole("link", { name: "Início" })).not.toHaveClass("text-pitch-400");
    expect(within(bottom).queryByRole("link", { name: "Login" })).toBeNull();
  });

  it("a raiz so fica ativa em / exato", async () => {
    setLocation("/");
    renderWithProviders(<AppShell>x</AppShell>);
    const bottom = (await screen.findAllByRole("navigation")).at(-1)!;
    expect(within(bottom).getByRole("link", { name: "Início" })).toHaveClass("text-pitch-400");
    expect(within(bottom).getByRole("link", { name: "Ranking" })).not.toHaveClass("text-pitch-400");
  });

  it("gaveta: mostra nome e papel, links e Sair; fecha pelo X, pelo fundo e ao navegar", async () => {
    renderWithProviders(<AppShell>x</AppShell>, { user: ADMIN });
    await userEvent.click(await screen.findByRole("button", { name: "Abrir menu" }));
    const drawer = screen.getByText("Configurações").closest("div.absolute") as HTMLElement;
    expect(within(drawer).getAllByText("Organizador")).toHaveLength(2); // o nome do usuario de teste e o papel
    expect(within(drawer).getByRole("button", { name: "Sair" })).toBeInTheDocument();

    await userEvent.click(within(drawer).getByRole("button", { name: "Fechar" }));
    expect(screen.queryByText("Configurações")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    await userEvent.click(screen.getByText("Configurações").closest("div.fixed")!);
    expect(screen.queryByText("Configurações")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    await userEvent.click(screen.getByRole("link", { name: "Configurações" }));
    expect(screen.queryByText("Configurações")).toBeNull();
  });

  it("Sair da gaveta chama a action de logout", async () => {
    (logoutAction as jest.Mock).mockResolvedValue(undefined);
    renderWithProviders(<AppShell>x</AppShell>);
    await userEvent.click(await screen.findByRole("button", { name: "Abrir menu" }));
    await userEvent.click(screen.getByRole("button", { name: "Sair" }));
    expect(logoutAction).toHaveBeenCalled();
  });
});

describe("UserAvatar (menu da conta no desktop)", () => {
  it("abre com nome e papel, fecha com Esc e por clique fora; Sair chama o logout", async () => {
    (logoutAction as jest.Mock).mockResolvedValue(undefined);
    renderWithProviders(
      <>
        <UserAvatar />
        <p>fora</p>
      </>,
      { user: PLAYER },
    );
    const trigger = await screen.findByRole("button", { name: "Abrir menu da conta" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    expect(screen.getByRole("menu")).toHaveTextContent("Jogador Teste");
    expect(screen.getByRole("menuitem", { name: "Perfil" })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("menuitem", { name: "Configurações" })).toHaveAttribute("href", "/settings");

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();

    await userEvent.click(trigger);
    await userEvent.click(screen.getByText("fora"));
    expect(screen.queryByRole("menu")).toBeNull();

    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "Sair" }));
    expect(logoutAction).toHaveBeenCalled();
  });

  it("clicar num item do menu fecha o menu; visitante nao renderiza nada", async () => {
    const { container, unmount } = renderWithProviders(<UserAvatar />);
    await userEvent.click(await screen.findByRole("button", { name: "Abrir menu da conta" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Perfil" }));
    expect(screen.queryByRole("menu")).toBeNull();
    unmount();
    const guest = renderWithProviders(<UserAvatar />, { user: null });
    await screen.findByText(/./, { selector: "body *" }).catch(() => {});
    expect(guest.container.querySelector("button")).toBeNull();
    expect(container).toBeDefined();
  });
});

describe("Player: Avatar, Stars, PlayerChip", () => {
  it("iniciais: primeira e ultima palavra; sem nome, interrogacao", () => {
    expect(initialsOf("gabriel souza")).toBe("GS");
    expect(initialsOf("  Ana  Maria  Silva ")).toBe("AS");
    expect(initialsOf("Pelé")).toBe("P");
    expect(initialsOf("")).toBe("?");
  });

  it("Avatar mostra a foto ou as iniciais", () => {
    render(
      <>
        <Avatar name="Gabriel Souza" photoUrl="/f.webp" />
        <Avatar name="Ana Lima" size="xl" />
      </>,
    );
    expect(screen.getByRole("img", { name: "Gabriel Souza" })).toHaveAttribute("src", "/f.webp");
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("Stars: sem nota, nota cheia, meia estrela e hideEmpty", () => {
    const { container, rerender } = render(<Stars value={null} />);
    expect(screen.getByText("sem avaliação")).toBeInTheDocument();
    rerender(<Stars value={3.5} />);
    expect(screen.getByLabelText("3.5 de 5 estrelas")).toBeInTheDocument();
    expect(container.querySelectorAll("svg").length).toBe(10);
    rerender(<Stars value={2} hideEmpty size={13} />);
    expect(container.querySelectorAll("svg").length).toBe(4);
    rerender(<Stars value={0} hideEmpty />);
    expect(container.querySelectorAll("svg").length).toBe(2);
  });

  it("PlayerChip abre o modal do jogador e mostra o subtitulo", async () => {
    mockFetch({ "GET /api/players/p1": { body: playerDetail() } });
    renderWithProviders(<PlayerChip userId="p1" name="Craque Souza" subtitle="Pivô" />);
    await userEvent.click(await screen.findByRole("button", { name: /Craque Souza/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Craque Souza");
    expect(screen.getByText("Pivô", { selector: "dd" })).toBeInTheDocument();
  });
});

describe("PlayerModalProvider", () => {
  async function openModal(detail = playerDetail()) {
    mockFetch({ "GET /api/players/p1": { body: detail } });
    renderWithProviders(<PlayerChip userId="p1" name="Craque Souza" />);
    await userEvent.click(await screen.findByRole("button", { name: /Craque Souza/ }));
    return screen.findByRole("dialog");
  }

  it("ficha: dados fisicos, estatisticas e apelido entre aspas", async () => {
    const dialog = await openModal();
    expect(await within(dialog).findByText("1,81 m")).toBeInTheDocument();
    expect(within(dialog).getByText("78 kg")).toBeInTheDocument();
    expect(within(dialog).getByText("27 anos")).toBeInTheDocument();
    expect(within(dialog).getByText("Canhoto")).toBeInTheDocument();
    expect(within(dialog).getByText('"CR"')).toBeInTheDocument();
    expect(within(dialog).getByText("Gols").previousSibling).toHaveTextContent("7");
    expect(within(dialog).queryByRole("button", { name: /Histórico/ })).toBeNull();
  });

  it("jogador com MMR: botao de historico leva ao extrato e o Voltar retorna", async () => {
    const dialog = await openModal(playerDetail({ rating: ratingDetail() }));
    await userEvent.click(await within(dialog).findByRole("button", { name: /Histórico/ }));
    expect(within(dialog).getByText("1.035")).toBeInTheDocument();
    expect(within(dialog).queryByText("Altura")).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(within(dialog).getByText("Altura")).toBeInTheDocument();
  });

  it("erro da API aparece no lugar da ficha", async () => {
    mockFetch({ "GET /api/players/p1": { status: 404, body: { error: "Este jogador ainda não preencheu o perfil." } } });
    renderWithProviders(<PlayerChip userId="p1" name="Sem Perfil" />);
    await userEvent.click(await screen.findByRole("button", { name: /Sem Perfil/ }));
    expect(await screen.findByText("Este jogador ainda não preencheu o perfil.")).toBeInTheDocument();
  });

  it("mostra Carregando enquanto busca; fecha por Esc, pelo X e pelo fundo", async () => {
    let finish!: () => void;
    mockFetch({ "GET /api/players/p1": () => new Promise((resolve) => (finish = () => resolve({ body: playerDetail() }))) });
    renderWithProviders(<PlayerChip userId="p1" name="Craque Souza" />);
    await userEvent.click(await screen.findByRole("button", { name: /Craque Souza/ }));
    expect(await screen.findByText("Carregando...")).toBeInTheDocument();
    finish();
    expect(await screen.findByText("1,81 m")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Craque Souza/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Craque Souza/ }));
    await userEvent.click(await screen.findByRole("dialog"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("usePlayerModal fora do provider avisa", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<PlayerChip userId="x" name="x" />)).toThrow("usePlayerModal precisa do PlayerModalProvider.");
    spy.mockRestore();
  });
});

describe("PlayerRatingCard", () => {
  it("resumo do MMR e extrato expansivel com a decomposicao", async () => {
    render(<PlayerRatingCard rating={ratingDetail()} />);
    expect(screen.getByText("1.035")).toBeInTheDocument();
    expect(screen.getAllByText("+12")).toHaveLength(2); // no resumo e na linha da ultima pelada
    expect(screen.getByText("2º · 3 peladas")).toBeInTheDocument();
    expect(screen.getByText("pico 1.050")).toBeInTheDocument();

    const first = screen.getByRole("button", { name: /Pelada de sexta/ });
    expect(first).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Limitado pelo teto de uma pelada.")).toBeInTheDocument();
    expect(screen.getByText(/fator de aposta 1,075 \(3,5★\)/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Pelada de quarta/ }));
    expect(screen.queryByText("Limitado pelo teto de uma pelada.")).toBeNull();
    expect(screen.getByText(/\(sem estrela\)/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Pelada de quarta/ }));
    expect(screen.queryByText(/\(sem estrela\)/)).toBeNull();
  });

  it("sem historico mostra so o resumo, no singular", () => {
    render(<PlayerRatingCard rating={{ ...ratingDetail(), gameDays: 1, history: [] }} />);
    expect(screen.getByText("2º · 1 pelada")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
});

describe("RankingTable", () => {
  const rows = [
    rankingRow({ userId: "a", name: "Ana", mmr: 1010, mmrRank: 2, mmrTrend: "down", mmrRankChange: -1, goals: 1, assists: 4, played: 2, won: 1, drawn: 1, winRate: 0.5, gameDays: 1, stars: 3 }),
    rankingRow({ userId: "b", name: "Bruno", nickname: "Bru", mmr: 1032.4, mmrRank: 1, mmrTrend: "up", mmrRankChange: 2, goals: 5, assists: 0, played: 3, won: 3, winRate: 1, gameDays: 2, mmrDelta: 12.2 }),
    rankingRow({ userId: "c", name: "Caio", mmr: null, mmrRank: null, goals: 5, assists: 2, played: 0, gameDays: 0 }),
    rankingRow({ userId: "d", name: "Duda", mmr: 1000, mmrRank: 3, mmrTrend: "flat", mmrRankChange: 0, played: 1, won: 0, lost: 1, mmrDelta: -3.2 }),
  ];
  const names = () => screen.getAllByRole("button").filter((b) => b.className.includes("rounded-xl")).map((b) => b.textContent);

  it("vazio: mensagem de ranking sem numeros", () => {
    renderWithProviders(<RankingTable rows={[]} />);
    expect(screen.getByText("Sem números ainda")).toBeInTheDocument();
  });

  it("geral: ordenado pelo MMR, sem MMR no fim, com o movimento de posicao", async () => {
    renderWithProviders(<RankingTable rows={rows} />);
    const list = await screen.findAllByRole("button", { name: /Bru|Ana|Caio|Duda/ });
    expect(list.map((b) => b.textContent)).toEqual([
      expect.stringContaining("Bru"),
      expect.stringContaining("Ana"),
      expect.stringContaining("Duda"),
      expect.stringContaining("Caio"),
    ]);
    expect(screen.getByText("1.032")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByLabelText("Subiu 2 posições na última pelada")).toBeInTheDocument();
    expect(screen.getByLabelText("Caiu 1 posição na última pelada")).toBeInTheDocument();
    expect(screen.getByLabelText("Manteve a posição na última pelada")).toBeInTheDocument();
    // O delta do organizador esta comentado no JSX da tabela hoje: nem o organizador ve os pontos.
    expect(screen.queryByText("+12")).toBeNull();
    expect(screen.queryByText("−3")).toBeNull();
    expect(names().length).toBe(4);
  });

  it.each([
    ["Artilharia", ["Bru", "Caio", "Ana", "Duda"], "1 jogo"],
    ["Assistências", ["Ana", "Caio", "Bru", "Duda"], "2 jogos"],
    ["Aproveitamento", ["Bru", "Ana", "Duda", "Caio"], "1V 1E 0D"],
    ["Presença", ["Bru", "Ana", "Caio", "Duda"], "peladas disputadas"],
  ])("categoria %s reordena", async (label, order, secondary) => {
    renderWithProviders(<RankingTable rows={rows} />);
    await userEvent.click(await screen.findByRole("button", { name: label }));
    const list = screen.getAllByRole("button", { name: /Bru|Ana|Caio|Duda/ }).filter((b) => b.className.includes("rounded-xl"));
    expect(list.map((b) => order.find((n) => b.textContent!.includes(n)))).toEqual(order);
    expect(screen.getAllByText(new RegExp(secondary)).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/na última pelada/)).toBeNull();
  });

  it("clicar na linha abre a ficha do jogador", async () => {
    mockFetch({ "GET /api/players/b": { body: playerDetail({ userId: "b", name: "Bruno Souza" }) } });
    renderWithProviders(<RankingTable rows={rows} />);
    await userEvent.click(await screen.findByRole("button", { name: /Bru/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Bruno Souza");
    expect(fetchCallsTo("GET", "/api/players/b")).toHaveLength(1);
  });
});

describe("LiveNowBanner", () => {
  const live = {
    gameDayId: "g1",
    title: "Pelada de sexta",
    match: { id: "m1", orderIndex: 2, status: "RUNNING", homeName: "A", awayName: "B", homeScore: 1, awayScore: 0 },
  };

  it("jogador comum nao busca nada nem mostra o atalho", async () => {
    const spy = mockFetch({});
    renderWithProviders(<LiveNowBanner />, { user: PLAYER });
    await screen.findByText("", { selector: "body" }).catch(() => {});
    expect(spy).not.toHaveBeenCalled();
    expect(screen.queryByText(/Ao vivo/)).toBeNull();
  });

  it("organizador: mostra placar e leva ao painel", async () => {
    mockFetch({ "GET /api/game-days/live-now": { body: { live } } });
    renderWithProviders(<LiveNowBanner />, { user: ADMIN, teamLabelMode: "numbers" });
    const banner = await screen.findByRole("link", { name: /Voltar ao painel/ });
    expect(banner).toHaveAttribute("href", "/game-days/g1/panel");
    expect(banner).toHaveTextContent("Ao vivo · Pelada de sexta");
    expect(banner).toHaveTextContent("Partida 2 · Time 1 1 x 0 Time 2 · Em andamento");
  });

  it("partida pausada destaca o estado; sem partida ou so agendada e intervalo", async () => {
    mockFetch({ "GET /api/game-days/live-now": { body: { live: { ...live, match: { ...live.match, status: "PAUSED" } } } } });
    const first = renderWithProviders(<LiveNowBanner />, { user: ADMIN });
    expect(await screen.findByText("Pausada")).toHaveClass("text-amber-300");
    first.unmount();

    mockFetch({ "GET /api/game-days/live-now": { body: { live: { ...live, match: { ...live.match, status: "SCHEDULED" } } } } });
    const second = renderWithProviders(<LiveNowBanner />, { user: ADMIN });
    expect(await screen.findByText("Intervalo · próxima partida pronta")).toBeInTheDocument();
    second.unmount();

    mockFetch({ "GET /api/game-days/live-now": { body: { live: { ...live, match: null } } } });
    renderWithProviders(<LiveNowBanner />, { user: ADMIN });
    expect(await screen.findByText("Intervalo")).toBeInTheDocument();
  });

  it("dispensar guarda na sessao e esconde; dentro do painel nao aparece", async () => {
    mockFetch({ "GET /api/game-days/live-now": { body: { live } } });
    const { unmount } = renderWithProviders(<LiveNowBanner />, { user: ADMIN });
    await userEvent.click(await screen.findByRole("button", { name: "Esconder atalho da partida ao vivo" }));
    expect(screen.queryByText(/Ao vivo/)).toBeNull();
    expect(sessionStorage.getItem(LIVE_BANNER_DISMISSED_KEY)).toBe("g1:m1");
    unmount();

    renderWithProviders(<LiveNowBanner />, { user: ADMIN });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(/Ao vivo/)).toBeNull();

    sessionStorage.clear();
    setLocation("/game-days/g1/panel");
    renderWithProviders(<LiveNowBanner />, { user: ADMIN });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(/Ao vivo/)).toBeNull();
  });

  it("erro de rede mantem o que ja esta na tela (nao quebra)", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("sem rede"));
    renderWithProviders(<LiveNowBanner />, { user: ADMIN });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(/Ao vivo/)).toBeNull();
  });

  it("resposta de erro do servidor tambem e ignorada", async () => {
    mockFetch({ "GET /api/game-days/live-now": { status: 500, body: {} } });
    renderWithProviders(<LiveNowBanner />, { user: ADMIN });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(/Ao vivo/)).toBeNull();
  });
});

describe("TeamName, BrandIcon e Skeleton", () => {
  it("TeamName segue a preferencia", async () => {
    const first = renderWithProviders(<TeamName name="B" />);
    expect(await screen.findByText("Time B")).toBeInTheDocument();
    first.unmount();
    renderWithProviders(<TeamName name="B" />, { teamLabelMode: "numbers" });
    expect(await screen.findByText("Time 2")).toBeInTheDocument();
  });

  it("BrandIcon e decorativo", () => {
    const { container } = render(<BrandIcon className="h-10" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("os esqueletos anunciam Carregando uma vez e escondem os blocos do leitor de tela", () => {
    render(
      <>
        <SkeletonScreen>
          <SkeletonPageHeader subtitle />
          <SkeletonPageHeader />
          <SkeletonBackLink />
          <SkeletonSectionTitle />
          <SkeletonListCard />
          <SkeletonScoreboard />
          <SkeletonChipList rows={3} />
          <SkeletonForm fields={2} />
          <SkeletonCard><SkeletonText /></SkeletonCard>
          <SkeletonBlock className="h-4" />
        </SkeletonScreen>
        <SkeletonTeamSummary players={3} history={1} />
      </>,
    );
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(screen.getAllByText("Carregando…")).toHaveLength(2);
  });
});
