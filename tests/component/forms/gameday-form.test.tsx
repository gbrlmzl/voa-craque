import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { DateTimePicker } from "@/components/forms/DateTimePicker";
import { GameDayForm } from "@/components/forms/GameDayForm";
import { NEW_GAMEDAY } from "@/lib/gameday-defaults";
import { fetchCallsTo, mockFetch } from "../../helpers/fetch-mock";
import { router } from "../../helpers/next-navigation";

function Controlled({ initial = "", error }: { initial?: string; error?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DateTimePicker value={value} onChange={setValue} error={error} id="quando" />
      <output data-testid="value">{value}</output>
    </>
  );
}
const value = () => screen.getByTestId("value").textContent;

describe("DateTimePicker", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(2030, 4, 10, 12, 0), advanceTimers: true });
  });

  it("sem valor mostra o convite; com valor mostra a data por extenso", () => {
    const { unmount } = render(<Controlled />);
    expect(screen.getByRole("button", { name: /Escolha o dia e a hora/ })).toBeInTheDocument();
    unmount();
    render(<Controlled initial="2030-05-20T19:30" />);
    expect(screen.getByRole("button", { name: /19:30/ })).toBeInTheDocument();
  });

  it("escolher dia, hora e minuto e confirmar grava no formato do input local", async () => {
    render(<Controlled />);
    await userEvent.click(screen.getByRole("button", { name: /Escolha o dia e a hora/ }));
    const sheet = screen.getByRole("dialog", { name: "Data e hora" });
    expect(within(sheet).getByRole("button", { name: "Confirmar" })).toBeDisabled();
    expect(within(sheet).getByText("Escolha o dia e a hora")).toBeInTheDocument();

    await userEvent.click(within(sheet).getByRole("button", { name: /(^|[ ,])20 de maio/ }));
    await userEvent.click(within(sheet).getByRole("button", { name: "21 horas" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "45 minutos" }));
    expect(within(sheet).getByText(/21:45/)).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Confirmar" }));

    expect(value()).toBe("2030-05-20T21:45");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("minutos comecam em 00 quando so a hora e escolhida", async () => {
    render(<Controlled />);
    await userEvent.click(screen.getByRole("button", { name: /Escolha o dia e a hora/ }));
    const sheet = screen.getByRole("dialog");
    await userEvent.click(within(sheet).getByRole("button", { name: /(^|[ ,])20 de maio/ }));
    await userEvent.click(within(sheet).getByRole("button", { name: "08 horas" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Confirmar" }));
    expect(value()).toBe("2030-05-20T08:00");
  });

  it("Hoje e Amanha preenchem o dia; dias passados ficam desabilitados", async () => {
    render(<Controlled />);
    await userEvent.click(screen.getByRole("button", { name: /Escolha o dia e a hora/ }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("button", { name: /(^|[ ,])9 de maio/ })).toBeDisabled();
    expect(within(sheet).getByRole("button", { name: /(^|[ ,])10 de maio/ })).toBeEnabled();

    await userEvent.click(within(sheet).getByRole("button", { name: "Hoje" }));
    expect(within(sheet).getByRole("button", { name: /(^|[ ,])10 de maio/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(sheet).getByRole("button", { name: "Amanhã" }));
    expect(within(sheet).getByRole("button", { name: /(^|[ ,])11 de maio/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("navega entre os meses", async () => {
    render(<Controlled />);
    await userEvent.click(screen.getByRole("button", { name: /Escolha o dia e a hora/ }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText(/maio/i, { selector: "p" })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Próximo mês" }));
    expect(within(sheet).getByText(/junho/i, { selector: "p" })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Mês anterior" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Mês anterior" }));
    expect(within(sheet).getByText(/abril/i, { selector: "p" })).toBeInTheDocument();
  });

  it("abre ja posicionado no valor atual e permite manter um dia passado ja salvo", async () => {
    render(<Controlled initial="2030-05-02T19:07" />);
    await userEvent.click(screen.getByRole("button", { name: /19:07/ }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("button", { name: /(^|[ ,])2 de maio/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(sheet).getByRole("button", { name: /(^|[ ,])2 de maio/ })).toBeEnabled();
    expect(within(sheet).getByRole("button", { name: /(^|[ ,])3 de maio/ })).toBeDisabled();
    // minuto fora dos passos de 5 fica disponivel como opcao extra
    expect(within(sheet).getByRole("button", { name: "07 minutos" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(sheet).getByRole("button", { name: "Confirmar" }));
    expect(value()).toBe("2030-05-02T19:07");
  });

  it("cancelar (X, Esc ou fundo) fecha sem alterar", async () => {
    render(<Controlled initial="2030-05-20T19:30" />);
    for (const close of ["x", "esc", "fundo"]) {
      await userEvent.click(screen.getByRole("button", { name: /19:30/ }));
      const sheet = screen.getByRole("dialog");
      await userEvent.click(within(sheet).getByRole("button", { name: "21 horas" }));
      if (close === "x") await userEvent.click(within(sheet).getByRole("button", { name: "Fechar" }));
      else if (close === "esc") await userEvent.keyboard("{Escape}");
      else await userEvent.pointer({ keys: "[MouseLeft]", target: sheet });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(value()).toBe("2030-05-20T19:30");
    }
  });

  it("marca o campo como invalido quando ha erro e e acessivel por id", () => {
    render(<Controlled error="Escolha o dia e a hora." />);
    const trigger = screen.getByRole("button", { name: /Escolha o dia e a hora/ });
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    expect(trigger).toHaveAttribute("id", "quando");
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
  });
});

describe("GameDayForm", () => {
  const initial = { ...NEW_GAMEDAY, title: "Pelada de quinta", location: "Ginásio", pixKey: "pix@x.com", scheduledAt: "2030-05-20T19:30" };

  it("criar: mostra os padroes e envia os valores convertidos (reais em centavos, minutos em segundos)", async () => {
    mockFetch({ "POST /api/game-days": { body: { id: "novo" } } });
    render(<GameDayForm initial={{ ...initial, price: "12,50", durationMin: "9" }} />);
    expect(screen.getByRole("button", { name: "Criar pelada" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Criar pelada" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/game-days/novo"));
    expect(fetchCallsTo("POST", "/api/game-days")[0].body).toEqual({
      title: "Pelada de quinta",
      scheduledAt: "2030-05-20T19:30",
      location: "Ginásio",
      pricePerPlayerCents: 1250,
      matchDurationSec: 540,
      goalsToWin: 2,
      maxPlayers: 20,
      teamSize: 4,
      pixKey: "pix@x.com",
      notes: "",
    });
    expect(router.refresh).toHaveBeenCalled();
  });

  it("preco com milhar e virgula", async () => {
    mockFetch({ "POST /api/game-days": { body: { id: "n" } } });
    render(<GameDayForm initial={{ ...initial, price: "1.234,56" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Criar pelada" }));
    await waitFor(() => expect(fetchCallsTo("POST", "/api/game-days")).toHaveLength(1));
    expect((fetchCallsTo("POST", "/api/game-days")[0].body as { pricePerPlayerCents: number }).pricePerPlayerCents).toBe(123456);
  });

  it("sem data escolhida nao chama a API e pede a data", async () => {
    const spy = mockFetch({});
    render(<GameDayForm initial={{ ...initial, scheduledAt: "" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Criar pelada" }));
    expect(await screen.findAllByText("Escolha o dia e a hora.")).not.toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("editar: PATCH na pelada e volta para a pagina dela", async () => {
    mockFetch({ "PATCH /api/game-days/g1": { body: { ok: true } } });
    render(<GameDayForm initial={initial} gameDayId="g1" />);
    await userEvent.clear(screen.getByPlaceholderText("Pelada de quinta"));
    await userEvent.type(screen.getByPlaceholderText("Pelada de quinta"), "Pelada nova");
    await userEvent.selectOptions(screen.getByRole("combobox"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/game-days/g1"));
    expect(fetchCallsTo("PATCH", "/api/game-days/g1")[0].body).toMatchObject({ title: "Pelada nova", teamSize: 5 });
  });

  it("erros por campo e a mensagem geral do servidor", async () => {
    mockFetch({
      "POST /api/game-days": {
        status: 422,
        body: { error: "Dados inválidos.", details: { title: "De um nome para a pelada.", maxPlayers: "Number must be greater than or equal to 10" } },
      },
    });
    render(<GameDayForm initial={initial} />);
    await userEvent.click(screen.getByRole("button", { name: "Criar pelada" }));
    expect(await screen.findByText("De um nome para a pelada.")).toBeInTheDocument();
    expect(screen.getByText("Number must be greater than or equal to 10")).toBeInTheDocument();
    expect(screen.getByText("Dados inválidos.")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Criar pelada" })).toBeEnabled();
  });

  it("conflito de edicao (pelada encerrada) aparece como mensagem", async () => {
    mockFetch({ "PATCH /api/game-days/g1": { status: 409, body: { error: "Pelada encerrada não pode ser editada." } } });
    render(<GameDayForm initial={initial} gameDayId="g1" />);
    await userEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Pelada encerrada não pode ser editada.")).toBeInTheDocument();
  });
});
