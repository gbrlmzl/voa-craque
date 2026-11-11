import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LivePanel } from "@/components/live/LivePanel";
import { SubstitutionModal } from "@/components/live/SubstitutionModal";
import type { LiveBenchPlayer, LiveMatch } from "@/services/live";
import { FakeEventSource } from "../../helpers/fake-event-source";
import { fetchCallsTo, mockFetch } from "../../helpers/fetch-mock";
import { liveSnapshot } from "../../helpers/fixtures-data";
import { router } from "../../helpers/next-navigation";
import { ADMIN, renderWithProviders } from "../../helpers/render";

const bench = (overrides: Partial<LiveBenchPlayer> & { userId: string; name: string }): LiveBenchPlayer =>
  ({ origin: "RESERVE", rosterTeamId: null, leftTeamId: null, nickname: null, photoUrl: null, ...overrides }) as LiveBenchPlayer;

const panel = (snapshot = liveSnapshot()) => renderWithProviders(<LivePanel gameDayId="g1" initial={snapshot} />, { user: ADMIN });
// Com a partida por comecar, o resultado da anterior ocuparia a tela: sem lastFinished o painel mostra os controles.
const withMatch = (matchOverrides: Record<string, unknown>) =>
  liveSnapshot(matchOverrides.status === "SCHEDULED" ? { lastFinished: null } : {}, matchOverrides);
const apiRoutes = {
  "GET /api/game-days/g1/live": { body: liveSnapshot() },
};

describe("LivePanel: relogio da partida", () => {
  it.each([
    ["SCHEDULED", /Iniciar partida/, "START"],
    ["RUNNING", /Pausar/, "PAUSE"],
    ["PAUSED", /Retomar/, "RESUME"],
  ])("partida %s: o botao certo chama o estado %s", async (status, label, action) => {
    mockFetch({ ...apiRoutes, "POST /api/matches/m2/state": { body: { ok: true } } });
    panel(withMatch({ status }));
    await userEvent.click(await screen.findByRole("button", { name: label }));
    await waitFor(() => expect(fetchCallsTo("POST", "/api/matches/m2/state")).toHaveLength(1));
    expect(fetchCallsTo("POST", "/api/matches/m2/state")[0].body).toEqual({ action });
    expect(router.refresh).toHaveBeenCalled();
  });

  it("iniciar e encerrar a partida avisam; encerrar so aparece com a partida correndo ou pausada", async () => {
    mockFetch({ ...apiRoutes, "POST /api/matches/m2/state": { body: { ok: true } } });
    const first = panel(withMatch({ status: "SCHEDULED" }));
    expect(screen.queryByRole("button", { name: /Encerrar partida/ })).toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: /Iniciar partida/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("Partida iniciada.");
    first.unmount();

    panel(withMatch({ status: "RUNNING" }));
    await userEvent.click(await screen.findByRole("button", { name: /Encerrar partida/ }));
    expect(await screen.findByText("Partida encerrada.")).toBeInTheDocument();
    expect(fetchCallsTo("POST", "/api/matches/m2/state").at(-1)!.body).toEqual({ action: "END" });
  });

  it("erro do servidor vira toast de erro", async () => {
    mockFetch({ ...apiRoutes, "POST /api/matches/m2/state": { status: 409, body: { error: "Esta partida já foi iniciada." } } });
    panel(withMatch({ status: "SCHEDULED" }));
    await userEvent.click(await screen.findByRole("button", { name: /Iniciar partida/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("Esta partida já foi iniciada.");
  });

  it("retomar fica desabilitado sem tempo restante", async () => {
    panel(withMatch({ status: "PAUSED", remainingMs: 0 }));
    expect(await screen.findByRole("button", { name: /Retomar/ })).toBeDisabled();
  });
});

describe("LivePanel: gol", () => {
  const goalRoutes = {
    ...apiRoutes,
    "POST /api/matches/m2/state": { body: { ok: true } },
    "POST /api/matches/m2/events": { body: { eventId: "ev1", assistEventId: "ev2" } },
    "DELETE /api/matches/m2/events/ev1": { body: { ok: true } },
  };

  it("gol com a partida correndo: pausa, pergunta a assistencia, grava, avisa com desfazer e destaca o Retomar", async () => {
    mockFetch(goalRoutes);
    panel();
    await userEvent.click(await screen.findByRole("button", { name: "Gol de A Ala" }));

    const modal = await screen.findByRole("dialog");
    expect(fetchCallsTo("POST", "/api/matches/m2/state")[0].body).toEqual({ action: "PAUSE" });
    await userEvent.click(within(modal).getByRole("button", { name: /A Fixo/ }));

    const toast = await screen.findByText("Gol de A Ala, assistência de A Fixo");
    expect(fetchCallsTo("POST", "/api/matches/m2/events")[0].body).toEqual({
      type: "GOAL",
      teamId: "tA",
      userId: "a2",
      assistUserId: "a3",
    });
    expect(toast.closest("[role=status]")).toHaveTextContent("Desfazer");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("desfazer o gol chama DELETE com a assistencia junto", async () => {
    mockFetch(goalRoutes);
    panel();
    await userEvent.click(await screen.findByRole("button", { name: "Gol de A Ala" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /A Fixo/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Desfazer" }));
    await waitFor(() => expect(fetchCallsTo("DELETE", "/api/matches/m2/events/ev1")).toHaveLength(1));
    expect(fetchCallsTo("DELETE", "/api/matches/m2/events/ev1")[0].url).toContain("assistEventId=ev2");
    expect(await screen.findByText("Desfeito.")).toBeInTheDocument();
  });

  it("gol individual (sem assistencia) tem outra mensagem e assistUserId nulo", async () => {
    mockFetch({ ...goalRoutes, "POST /api/matches/m2/events": { body: { eventId: "ev1", assistEventId: null } } });
    panel();
    await userEvent.click(await screen.findByRole("button", { name: "Gol de A Ala" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /Individual/ }));
    expect(await screen.findByText("Gol de A Ala")).toBeInTheDocument();
    expect((fetchCallsTo("POST", "/api/matches/m2/events")[0].body as { assistUserId: unknown }).assistUserId).toBeNull();
  });

  it("cancelar o gol nao grava nada e mostra a dica de retomar quando esta pausada", async () => {
    mockFetch(goalRoutes);
    panel(withMatch({ status: "PAUSED" }));
    await userEvent.click(await screen.findByRole("button", { name: "Gol de A Ala" }));
    expect(fetchCallsTo("POST", "/api/matches/m2/state")).toHaveLength(0); // ja pausada: nao pausa de novo
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    expect(fetchCallsTo("POST", "/api/matches/m2/events")).toHaveLength(0);
    expect(await screen.findByText("Cronômetro parado. Toque em Retomar.")).toBeInTheDocument();
  });

  it("tocar fora da dica de retomar a dispensa", async () => {
    mockFetch(goalRoutes);
    panel(withMatch({ status: "PAUSED" }));
    await userEvent.click(await screen.findByRole("button", { name: "Gol de A Ala" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    await screen.findByText("Cronômetro parado. Toque em Retomar.");
    const curtain = document.querySelector("div[aria-hidden].fixed") as HTMLElement;
    await userEvent.click(curtain);
    expect(screen.queryByText("Cronômetro parado. Toque em Retomar.")).toBeNull();
  });

  it("erro ao gravar o gol: toast e nenhum aviso de sucesso", async () => {
    mockFetch({ ...goalRoutes, "POST /api/matches/m2/events": { status: 409, body: { error: "A partida já foi encerrada." } } });
    panel();
    await userEvent.click(await screen.findByRole("button", { name: "Gol de A Ala" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /A Fixo/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("A partida já foi encerrada.");
  });

  it("falha ao pausar nao abre o modal do gol", async () => {
    mockFetch({ ...goalRoutes, "POST /api/matches/m2/state": { status: 500, body: { error: "Erro interno do servidor." } } });
    panel();
    await userEvent.click(await screen.findByRole("button", { name: "Gol de A Ala" }));
    expect(await screen.findByText("Erro interno do servidor.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("os botoes de gol ficam desabilitados com a partida ainda por comecar", async () => {
    panel(withMatch({ status: "SCHEDULED" }));
    expect(await screen.findByRole("button", { name: "Gol de A Ala" })).toBeDisabled();
  });
});

describe("LivePanel: substituicao", () => {
  const benchPlayers = [
    bench({ userId: "r1", name: "Reserva Um", origin: "RESERVE" }),
    bench({ userId: "c1", name: "C Ala", origin: "QUEUE", rosterTeamId: "tC" }),
  ];
  const routes = {
    ...apiRoutes,
    "POST /api/matches/m2/substitutions": { body: { substitutionId: "s1" } },
    "DELETE /api/matches/m2/substitutions/s1": { body: { ok: true } },
  };

  it("abre o modal do time, confirma, avisa e permite desfazer", async () => {
    mockFetch(routes);
    panel(withMatch({ bench: benchPlayers }));
    await userEvent.click((await screen.findAllByRole("button", { name: /Substituição/ }))[0]);
    const modal = screen.getByRole("dialog", { name: "Substituição do Time A" });

    await userEvent.click(within(modal).getByRole("button", { name: /A Ala/ }));
    await userEvent.click(within(modal).getByRole("button", { name: /Reserva Um/ }));
    await userEvent.click(within(modal).getByRole("button", { name: "Confirmar substituição" }));

    expect(await screen.findByText("Entrou Reserva Um, saiu A Ala")).toBeInTheDocument();
    expect(fetchCallsTo("POST", "/api/matches/m2/substitutions")[0].body).toEqual({
      teamId: "tA",
      outUserId: "a2",
      inUserId: "r1",
      permanent: false,
    });
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(await screen.findByText("Substituição desfeita.")).toBeInTheDocument();
    expect(fetchCallsTo("DELETE", "/api/matches/m2/substitutions/s1")).toHaveLength(1);
  });

  it("erro do servidor aparece e o modal continua aberto", async () => {
    mockFetch({ ...routes, "POST /api/matches/m2/substitutions": { status: 400, body: { error: "Quem entra já está em quadra." } } });
    panel(withMatch({ bench: benchPlayers }));
    await userEvent.click((await screen.findAllByRole("button", { name: /Substituição/ }))[0]);
    const modal = screen.getByRole("dialog");
    await userEvent.click(within(modal).getByRole("button", { name: /A Ala/ }));
    await userEvent.click(within(modal).getByRole("button", { name: /Reserva Um/ }));
    await userEvent.click(within(modal).getByRole("button", { name: "Confirmar substituição" }));
    expect(await screen.findByText("Quem entra já está em quadra.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("cancelar fecha sem chamar a API", async () => {
    mockFetch(routes);
    panel(withMatch({ bench: benchPlayers }));
    await userEvent.click((await screen.findAllByRole("button", { name: /Substituição/ }))[1]);
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchCallsTo("POST", "/api/matches/m2/substitutions")).toHaveLength(0);
  });
});

describe("LivePanel: estados da pelada", () => {
  it("resultado da partida anterior, com o botao para a proxima", async () => {
    panel(liveSnapshot({}, { status: "SCHEDULED", homeScore: 0, awayScore: 0, events: [] }));
    expect(await screen.findByText("Time C venceu")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Iniciar partida/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Próxima partida/ }));
    expect(await screen.findByRole("button", { name: /Iniciar partida/ })).toBeInTheDocument();
    expect(screen.queryByText("Time C venceu")).toBeNull();
  });

  it("resultado sem proxima partida montada", async () => {
    panel(liveSnapshot({ match: null }));
    expect(await screen.findByText("Não há próxima partida montada.")).toBeInTheDocument();
  });

  it("sem partida nem resultado: pede para montar os times", async () => {
    panel(liveSnapshot({ match: null, lastFinished: null }));
    expect(await screen.findByText("Nenhuma partida montada")).toBeInTheDocument();
  });

  it("encerrar a pelada so aparece depois do primeiro apito", async () => {
    mockFetch({ ...apiRoutes, "POST /api/game-days/g1/finish": { body: { ok: true } } });
    const first = panel(liveSnapshot({ lastFinished: null }, { status: "SCHEDULED" }));
    await screen.findByRole("button", { name: /Iniciar partida/ });
    expect(screen.queryByText("Fim de papo")).toBeNull();
    first.unmount();

    panel();
    expect(await screen.findByText("Fim de papo")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Encerrar pelada/ }));
    await userEvent.click(screen.getByRole("button", { name: "Encerrar mesmo" }));
    expect(await screen.findByText("Pelada encerrada. Estatísticas contabilizadas.")).toBeInTheDocument();
  });

  it("pelada encerrada: aviso e nada de controles", async () => {
    panel(liveSnapshot({ gameDay: { ...liveSnapshot().gameDay, status: "FINISHED" } }));
    expect(await screen.findByText("Pelada encerrada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pausar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Gol de/ })).toBeNull();
    expect(screen.queryByText("Fim de papo")).toBeNull();
  });

  it("fila: tocar abre o resumo do time; lances e fila vazia", async () => {
    mockFetch({
      "GET /api/game-days/g1/teams/tC": {
        body: { team: { id: "tC", name: "C", queuePosition: 1 }, players: [], record: { played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 1 }, history: [] },
      },
    });
    const first = panel();
    expect(await screen.findByText("Lances")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Ver Time C/ }));
    expect(await screen.findByText("1º na fila")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));
    first.unmount();

    panel(liveSnapshot({ queue: [] }, { events: [] }));
    expect(await screen.findByText("Ninguém na fila")).toBeInTheDocument();
    expect(screen.queryByText("Lances")).toBeNull();
  });

  it("acompanha o canal ao vivo (um snapshot novo muda o placar)", async () => {
    panel();
    await screen.findByText("Partida 2");
    act(() => FakeEventSource.last.emit("snapshot", liveSnapshot({}, { homeScore: 2, awayScore: 1 })));
    await waitFor(() => expect(document.body).toHaveTextContent(/Partida 2/));
  });
});

describe("SubstitutionModal", () => {
  const match = (benchPlayers: LiveBenchPlayer[]) => ({ ...liveSnapshot().match!, bench: benchPlayers }) as LiveMatch;
  const render = (benchPlayers: LiveBenchPlayer[], extra: Partial<React.ComponentProps<typeof SubstitutionModal>> = {}) => {
    const m = match(benchPlayers);
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    renderWithProviders(
      <SubstitutionModal team={m.home} match={m} queue={[{ id: "tC", name: "C" }]} busy={false} onConfirm={onConfirm} onCancel={onCancel} {...extra} />,
      { user: ADMIN },
    );
    return { onConfirm, onCancel };
  };
  const pickOut = (name: string) => userEvent.click(screen.getByRole("button", { name: new RegExp(name) }));

  it("sem ninguem para entrar avisa; confirmar comeca desabilitado", async () => {
    render([]);
    expect(await screen.findByText("Ninguém disponível para entrar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar substituição" })).toBeDisabled();
  });

  it("os candidatos vem agrupados: saiu da partida, fila e reservas", async () => {
    render([
      bench({ userId: "l1", name: "Saiu Antes", origin: "LEFT_MATCH", leftTeamId: "tA" }),
      bench({ userId: "c1", name: "C Ala", origin: "QUEUE", rosterTeamId: "tC" }),
      bench({ userId: "r1", name: "Reserva Um", origin: "RESERVE" }),
    ]);
    expect(await screen.findByText("Saíram desta partida")).toBeInTheDocument();
    expect(screen.getByText("Time C")).toBeInTheDocument();
    expect(screen.getByText("Reservas")).toBeInTheDocument();
    expect(screen.getByText("Goleiro")).toBeInTheDocument();
  });

  it("escolher quem sai e quem entra mostra o resumo e libera confirmar (so nesta partida)", async () => {
    const { onConfirm } = render([bench({ userId: "r1", name: "Reserva Um" })]);
    await screen.findByText("Reservas");
    await pickOut("A Ala");
    await userEvent.click(screen.getByRole("button", { name: /Reserva Um/ }));
    expect(screen.getByRole("radio", { name: /Só nesta partida/ })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar substituição" }));
    expect(onConfirm).toHaveBeenCalledWith({ outUserId: "a2", inUserId: "r1", permanent: false });
  });

  it("troca ate o fim da pelada quando permitida", async () => {
    const { onConfirm } = render([bench({ userId: "r1", name: "Reserva Um" })]);
    await screen.findByText("Reservas");
    await pickOut("A Ala");
    await userEvent.click(screen.getByRole("button", { name: /Reserva Um/ }));
    await userEvent.click(screen.getByRole("radio", { name: /Até o fim da pelada/ }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar substituição" }));
    expect(onConfirm).toHaveBeenCalledWith({ outUserId: "a2", inUserId: "r1", permanent: true });
  });

  it("cancelar e ocupado", async () => {
    const { onCancel } = render([bench({ userId: "r1", name: "Reserva Um" })]);
    await userEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("ocupado trava as escolhas", async () => {
    render([bench({ userId: "r1", name: "Reserva Um" })], { busy: true });
    for (const button of await screen.findAllByRole("button")) expect(button).toBeDisabled();
  });
});
