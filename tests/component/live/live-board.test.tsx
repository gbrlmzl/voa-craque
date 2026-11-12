import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FixedDigits } from "@/components/live/FixedDigits";
import { GoalAssistModal } from "@/components/live/GoalAssistModal";
import { LiveBoard } from "@/components/live/LiveBoard";
import { MatchFeed } from "@/components/live/MatchFeed";
import { MatchResultCard } from "@/components/live/MatchResultCard";
import { QueueBadges } from "@/components/live/QueueBadges";
import { Scoreboard } from "@/components/live/Scoreboard";
import { TeamSummaryModal } from "@/components/live/TeamSummaryModal";
import type { LiveMatch } from "@/services/live";
import { FakeEventSource } from "../../helpers/fake-event-source";
import { fetchCallsTo, mockFetch } from "../../helpers/fetch-mock";
import { liveSnapshot } from "../../helpers/fixtures-data";
import { renderWithProviders } from "../../helpers/render";

const snapshot = () => liveSnapshot();
const matchOf = (overrides: Record<string, unknown> = {}) => ({ ...liveSnapshot().match!, ...overrides }) as LiveMatch;

describe("FixedDigits", () => {
  it("o valor fica legivel para leitor de tela e cada digito tem largura propria", () => {
    const { container } = render(<FixedDigits value="09:41" />);
    expect(screen.getByText("09:41")).toHaveClass("sr-only");
    const cells = container.querySelectorAll("[aria-hidden] > span");
    expect(cells).toHaveLength(5);
    expect(cells[2]).toHaveClass("w-[0.32em]");
    expect(cells[0]).toHaveClass("w-[0.62em]");
  });
});

describe("Scoreboard", () => {
  it("placar, relogio, estado e meta de gols", async () => {
    renderWithProviders(<Scoreboard match={matchOf()} remainingMs={300_000} goalsToWin={2} streaming />);
    expect(await screen.findByText("Partida 2")).toBeInTheDocument();
    expect(screen.getByText("05:00")).toBeInTheDocument();
    expect(screen.getByText("Em andamento")).toBeInTheDocument();
    expect(screen.getByText("ao vivo")).toBeInTheDocument();
    expect(screen.getByText("2 gols encerram a partida")).toBeInTheDocument();
    expect(screen.getByText("Time A")).toBeInTheDocument();
    expect(screen.getByText("Time B")).toBeInTheDocument();
  });

  it("no ultimo minuto o relogio fica vermelho; reconectando; gol no singular; modo numerico", async () => {
    renderWithProviders(<Scoreboard match={matchOf()} remainingMs={59_000} goalsToWin={1} streaming={false} />, { teamLabelMode: "numbers" });
    expect(await screen.findByText("reconectando")).toBeInTheDocument();
    expect(screen.getByText("00:59").closest("span.inline-flex")).toHaveClass("text-rose-400");
    expect(screen.getByText("1 gol encerra a partida")).toBeInTheDocument();
    expect(screen.getByText("Time 1")).toBeInTheDocument();
  });

  it("pausada com pouco tempo nao fica vermelha", async () => {
    renderWithProviders(<Scoreboard match={matchOf({ status: "PAUSED" })} remainingMs={30_000} goalsToWin={2} streaming />);
    expect((await screen.findByText("00:30")).closest("span.inline-flex")).not.toHaveClass("text-rose-400");
    expect(screen.getByText("Pausada")).toBeInTheDocument();
  });
});

describe("MatchFeed", () => {
  const events = liveSnapshot().match!.events;
  it("gols e assistencias com o minuto e o time", async () => {
    renderWithProviders(<MatchFeed events={events} substitutions={[]} />);
    expect(await screen.findByText("A Ala")).toBeInTheDocument();
    expect(screen.getByText("A Fixo")).toBeInTheDocument();
    expect(screen.getAllByText("3'")).toHaveLength(2);
    expect(screen.getAllByText("Time A")).toHaveLength(2);
  });

  it("substituicoes aparecem no feed com quem entra e quem sai", async () => {
    renderWithProviders(
      <MatchFeed
        events={[]}
        substitutions={[{ id: "s1", teamId: "tA", teamName: "A", outName: "A Pivo", inName: "Reserva", elapsedMs: 60_000, permanent: false, createdAt: "2030-05-10T23:01:00.000Z" }]}
      />,
    );
    expect(await screen.findByText("Entra Reserva")).toBeInTheDocument();
    expect(screen.getByText(/sai A Pivo/)).toBeInTheDocument();
  });

  it("limit corta a lista", async () => {
    renderWithProviders(<MatchFeed events={events} substitutions={[]} limit={1} />);
    await screen.findByText(/A (Ala|Fixo)/);
    expect(document.querySelectorAll("p.flex")).toHaveLength(1);
  });
});

describe("MatchResultCard", () => {
  const result = liveSnapshot().lastFinished!;

  it("vencedor, gols com assistencia, tempo e proxima partida", async () => {
    renderWithProviders(<MatchResultCard result={result} next={{ homeName: "A", awayName: "B" }} />);
    expect(await screen.findByText("Time C venceu")).toBeInTheDocument();
    expect(screen.getByText(/Partida 1 · Por gols/)).toBeInTheDocument();
    expect(screen.getByText(/assistência de C Fixo/)).toBeInTheDocument();
    expect(screen.getByText("04:00")).toBeInTheDocument();
    expect(screen.getByText("Time A x Time B")).toBeInTheDocument();
  });

  it("empate, gol individual, sem gols e sem proxima partida", async () => {
    const draw = { ...result, result: "DRAW" as const, winnerName: null, endReason: "TIME" as const, goals: [{ ...result.goals[0], assistName: null }] };
    const first = renderWithProviders(<MatchResultCard result={draw} next={null}>filho</MatchResultCard>);
    expect(await screen.findByText("Empate — os dois saem")).toBeInTheDocument();
    expect(screen.getByText(/individual/)).toBeInTheDocument();
    expect(screen.getByText(/Pelo tempo/)).toBeInTheDocument();
    expect(screen.queryByText("Próxima partida")).toBeNull();
    expect(screen.getByText("filho")).toBeInTheDocument();
    first.unmount();
    renderWithProviders(<MatchResultCard result={{ ...result, goals: [], endReason: null }} next={null} />);
    expect(await screen.findByText("Sem gols nesta partida.")).toBeInTheDocument();
    expect(screen.getByText(/Encerrada/)).toBeInTheDocument();
  });
});

describe("QueueBadges", () => {
  it("lista a fila em ordem e avisa qual time foi tocado", async () => {
    const onSelect = jest.fn();
    renderWithProviders(<QueueBadges queue={[{ id: "tC", name: "C" }, { id: "tD", name: "D" }]} onSelect={onSelect} />);
    await userEvent.click(await screen.findByRole("button", { name: "Ver Time D, 2º na fila" }));
    expect(onSelect).toHaveBeenCalledWith("tD");
    expect(screen.getByText("1º · Time C")).toBeInTheDocument();
  });

  it("desabilitada nao responde", async () => {
    const onSelect = jest.fn();
    renderWithProviders(<QueueBadges queue={[{ id: "tC", name: "C" }]} disabled onSelect={onSelect} />);
    const button = await screen.findByRole("button");
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("GoalAssistModal", () => {
  const match = liveSnapshot().match!;
  const team = match.home;
  const scorer = team.players[1];

  it("lista os companheiros (sem o autor do gol) e devolve o escolhido", async () => {
    const onConfirm = jest.fn();
    render(<GoalAssistModal team={team} scorer={scorer} busy={false} onConfirm={onConfirm} onCancel={() => {}} />);
    expect(screen.getByText("Gol de")).toBeInTheDocument();
    expect(screen.getAllByText("A Ala")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /A Ala/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /A Fixo/ }));
    expect(onConfirm).toHaveBeenCalledWith(team.players[2]);
  });

  it("individual devolve null; cancelar chama onCancel; ocupado trava tudo", async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const { rerender } = render(<GoalAssistModal team={team} scorer={scorer} busy={false} onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /Individual/ }));
    expect(onConfirm).toHaveBeenCalledWith(null);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalled();
    rerender(<GoalAssistModal team={team} scorer={scorer} busy onConfirm={onConfirm} onCancel={onCancel} />);
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
  });
});

describe("TeamSummaryModal", () => {
  const summary = {
    team: { id: "tC", name: "C", queuePosition: 1 },
    players: [
      { userId: "c1", name: "C Goleiro", photoUrl: null, isKeeper: true },
      { userId: "c2", name: "C Ala", photoUrl: null, isKeeper: false },
    ],
    record: { played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 5, goalsAgainst: 4 },
    history: [
      { matchId: "m1", orderIndex: 1, opponentTeamId: "tB", opponentName: "B", goalsFor: 2, goalsAgainst: 1, outcome: "WIN" },
      { matchId: "m2", orderIndex: 2, opponentTeamId: "tA", opponentName: "A", goalsFor: 0, goalsAgainst: 1, outcome: "LOSS" },
      { matchId: "m3", orderIndex: 3, opponentTeamId: "tB", opponentName: "B", goalsFor: 1, goalsAgainst: 1, outcome: "DRAW" },
    ],
  };
  const open = (props: Partial<React.ComponentProps<typeof TeamSummaryModal>> = {}) =>
    renderWithProviders(<TeamSummaryModal gameDayId="g1" team={{ id: "tC", name: "C" }} refreshKey={null} onClose={() => {}} {...props} />);

  it("carrega o resumo: posicao na fila, J/V/E/D, gols, elenco e historico com o resultado", async () => {
    mockFetch({ "GET /api/game-days/g1/teams/tC": { body: summary } });
    open();
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
    expect(await screen.findByText("1º na fila")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "3 jogos, 1 vitórias, 1 empates, 1 derrotas" })).toBeInTheDocument();
    expect(screen.getByText("Gols: 5 pró, 4 contra")).toBeInTheDocument();
    expect(screen.getByText("Goleiro")).toBeInTheDocument();
    expect(screen.getByText("Partida 1 · Venceu o Time B por 2 x 1")).toBeInTheDocument();
    expect(screen.getByText("Partida 2 · Perdeu para o Time A por 0 x 1")).toBeInTheDocument();
    expect(screen.getByText("Partida 3 · Empatou com o Time B, 1 x 1")).toBeInTheDocument();
  });

  it("time que ainda nao jogou e esta em quadra (sem posicao na fila)", async () => {
    mockFetch({ "GET /api/game-days/g1/teams/tC": { body: { ...summary, team: { ...summary.team, queuePosition: null }, history: [] } } });
    open();
    expect(await screen.findByText("Ainda não jogou nesta pelada.")).toBeInTheDocument();
    expect(screen.queryByText(/na fila/)).toBeNull();
  });

  it("erro da API aparece e fecha pelo X", async () => {
    const onClose = jest.fn();
    mockFetch({ "GET /api/game-days/g1/teams/tC": { status: 404, body: { error: "Time não encontrado." } } });
    open({ onClose });
    expect(await screen.findByText("Time não encontrado.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("buscar de novo quando a chave de atualizacao muda (terminou uma partida)", async () => {
    mockFetch({ "GET /api/game-days/g1/teams/tC": { body: summary } });
    const { rerender } = open({ refreshKey: "m1" });
    await screen.findByText("1º na fila");
    expect(fetchCallsTo("GET", "/api/game-days/g1/teams/tC")).toHaveLength(1);
    rerender(<TeamSummaryModal gameDayId="g1" team={{ id: "tC", name: "C" }} refreshKey="m2" onClose={() => {}} />);
    await waitFor(() => expect(fetchCallsTo("GET", "/api/game-days/g1/teams/tC")).toHaveLength(2));
  });
});

describe("LiveBoard (espectador)", () => {
  it("assina o canal ao vivo da pelada e mostra placar, times, lances, fila e classificacao", async () => {
    renderWithProviders(<LiveBoard gameDayId="g1" initial={snapshot()} />);
    expect(FakeEventSource.last.url).toBe("/api/game-days/g1/stream");
    expect(await screen.findByText("Partida 2")).toBeInTheDocument();
    expect(screen.getByText("A Goleiro")).toBeInTheDocument();
    expect(screen.getByText("B Goleiro")).toBeInTheDocument();
    expect(screen.getByText("1 esperando")).toBeInTheDocument();
    expect(screen.getByText("Lances")).toBeInTheDocument();
    expect(screen.getByText("Como estão os times")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(3); // cabecalho + 2 times que jogaram
    expect(within(table).getByText("2:1")).toBeInTheDocument();
  });

  it("um snapshot novo pelo SSE atualiza a tela e marca 'ao vivo'", async () => {
    renderWithProviders(<LiveBoard gameDayId="g1" initial={snapshot()} />);
    expect(await screen.findByText("reconectando")).toBeInTheDocument();
    act(() => FakeEventSource.last.emit("snapshot", liveSnapshot({}, { homeScore: 2, awayScore: 1 })));
    expect(await screen.findByText("ao vivo")).toBeInTheDocument();
    expect(document.body).toHaveTextContent(/Partida 2/);
  });

  it("snapshot corrompido nao quebra e volta a reconectar", async () => {
    renderWithProviders(<LiveBoard gameDayId="g1" initial={snapshot()} />);
    act(() => FakeEventSource.last.emit("snapshot", "{nao e json"));
    expect(await screen.findByText("reconectando")).toBeInTheDocument();
  });

  it("sem SSE, cai para polling a cada 3 s; quando o SSE volta, para de fazer polling", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    mockFetch({ "GET /api/game-days/g1/live": { body: liveSnapshot({}, { homeScore: 2 }) } });
    renderWithProviders(<LiveBoard gameDayId="g1" initial={snapshot()} />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3100);
    });
    expect(fetchCallsTo("GET", "/api/game-days/g1/live").length).toBeGreaterThanOrEqual(1);

    const before = fetchCallsTo("GET", "/api/game-days/g1/live").length;
    act(() => FakeEventSource.last.emit("open"));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(7000);
    });
    expect(fetchCallsTo("GET", "/api/game-days/g1/live")).toHaveLength(before);

    act(() => FakeEventSource.last.emit("error"));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3100);
    });
    expect(fetchCallsTo("GET", "/api/game-days/g1/live").length).toBeGreaterThan(before);
  });

  it("polling com erro do servidor nao troca a tela", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    mockFetch({ "GET /api/game-days/g1/live": { status: 500, body: {} } });
    renderWithProviders(<LiveBoard gameDayId="g1" initial={snapshot()} />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3100);
    });
    expect(screen.getByText("Partida 2")).toBeInTheDocument();
  });

  it("o cronometro local desconta o tempo desde o ultimo snapshot", async () => {
    jest.useFakeTimers({ now: new Date("2030-05-10T23:00:00Z"), advanceTimers: true });
    renderWithProviders(<LiveBoard gameDayId="g1" initial={snapshot()} />);
    expect(await screen.findByText("05:00")).toBeInTheDocument();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_500);
    });
    expect(screen.getByText("04:49")).toBeInTheDocument();
  });

  it("desmontar fecha a conexao", async () => {
    const { unmount } = renderWithProviders(<LiveBoard gameDayId="g1" initial={snapshot()} />);
    const source = FakeEventSource.last;
    unmount();
    expect(source.closed).toBe(true);
  });

  it("entre partidas o resultado ocupa o lugar do placar, com a proxima partida", async () => {
    renderWithProviders(<LiveBoard gameDayId="g1" initial={liveSnapshot({}, { status: "SCHEDULED", homeScore: 0, awayScore: 0, events: [] })} />);
    expect(await screen.findByText("Time C venceu")).toBeInTheDocument();
    expect(screen.getByText("Time A x Time B")).toBeInTheDocument();
    expect(screen.queryByText("ao vivo")).toBeNull();
    expect(screen.getByText("Nada marcado ainda")).toBeInTheDocument();
  });

  it("pelada encerrada: aviso e classificacao final", async () => {
    renderWithProviders(<LiveBoard gameDayId="g1" initial={liveSnapshot({ gameDay: { ...snapshot().gameDay, status: "FINISHED" }, match: null })} />);
    expect(await screen.findByText("A pelada de hoje acabou")).toBeInTheDocument();
    expect(screen.getByText("Como estão os times")).toBeInTheDocument();
  });

  it("sem partida montada", async () => {
    renderWithProviders(<LiveBoard gameDayId="g1" initial={liveSnapshot({ match: null, lastFinished: null, standings: [] })} />);
    expect(await screen.findByText("Ainda não rolou nada")).toBeInTheDocument();
  });

  it("fila vazia", async () => {
    renderWithProviders(<LiveBoard gameDayId="g1" initial={liveSnapshot({ queue: [] })} />);
    expect(await screen.findByText("Ninguém na fila")).toBeInTheDocument();
  });

  it("tocar num time da fila abre o resumo dele; fechar volta", async () => {
    mockFetch({
      "GET /api/game-days/g1/teams/tC": {
        body: {
          team: { id: "tC", name: "C", queuePosition: 1 },
          players: [],
          record: { played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 1 },
          history: [],
        },
      },
    });
    renderWithProviders(<LiveBoard gameDayId="g1" initial={snapshot()} />);
    await userEvent.click(await screen.findByRole("button", { name: /Ver Time C/ }));
    expect(await screen.findByText("1º na fila")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByText("1º na fila")).toBeNull();
  });

  it("tocar num jogador abre a ficha", async () => {
    mockFetch({ "GET /api/players/a2": { body: { userId: "a2", name: "A Ala Completo", nickname: null, photoUrl: null, position: "ALA", positionLabel: "Ala", footLabel: "Destro", age: 20, heightCm: 170, weightKg: 70, stars: 3, rating: null, stats: { goals: 0, assists: 0, played: 0, won: 0, winRate: 0 } } } });
    renderWithProviders(<LiveBoard gameDayId="g1" initial={snapshot()} />);
    await userEvent.click(await screen.findByRole("button", { name: /A Ala 0 gols/ }));
    expect(await screen.findByText("A Ala Completo")).toBeInTheDocument();
  });
});
