import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReceiptModal } from "@/components/gameday/ReceiptModal";
import { RegistrationPanel, type Registration } from "@/components/gameday/RegistrationPanel";
import { RejectReasonModal } from "@/components/gameday/RejectReasonModal";
import { RemoveRegistrationModal } from "@/components/gameday/RemoveRegistrationModal";
import { CancelGameDayButton } from "@/components/gameday/CancelGameDayButton";
import { FinishGameDayButton } from "@/components/gameday/FinishGameDayButton";
import { RestoreGameDayButton } from "@/components/gameday/RestoreGameDayButton";
import { StartGameDayButton } from "@/components/gameday/StartGameDayButton";
import { fetchCallsTo, mockFetch } from "../../helpers/fetch-mock";
import { router, setLocation } from "../../helpers/next-navigation";
import { renderWithProviders } from "../../helpers/render";

const receiptFile = (name = "pix.png", type = "image/png", size = 1000) => new File([new Uint8Array(size)], name, { type });

function panel(props: Partial<React.ComponentProps<typeof RegistrationPanel>> = {}) {
  return renderWithProviders(
    <RegistrationPanel gameDayId="g1" price="R$ 10,00" pixKey="pix@voacraque.app" registration={null} open full={false} {...props} />,
  );
}
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

describe("RegistrationPanel: inscrever", () => {
  it("PIX e o metodo inicial: mostra a chave, copia para a area de transferencia e pede comprovante", async () => {
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
    panel();
    expect(await screen.findByText("pix@voacraque.app")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Chave PIX/ }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("pix@voacraque.app");
    expect(await screen.findByRole("status")).toHaveTextContent("Chave PIX copiada.");
    expect(screen.getByRole("button", { name: /Anexar comprovante/ })).toBeInTheDocument();
  });

  it("sem chave PIX cadastrada avisa o jogador", async () => {
    panel({ pixKey: null });
    expect(await screen.findByText("O organizador não cadastrou chave PIX.")).toBeInTheDocument();
  });

  it("confirmar sem comprovante nao chama a API", async () => {
    const spy = mockFetch({});
    panel();
    await userEvent.click(await screen.findByRole("button", { name: "Confirmar inscrição" }));
    expect(screen.getByText("Anexe o comprovante do PIX.")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("no local nao pede comprovante: inscreve direto e avisa", async () => {
    mockFetch({ "POST /api/game-days/g1/registrations": { body: { id: "r1" } } });
    panel();
    await userEvent.click(await screen.findByRole("button", { name: "Pago no local" }));
    expect(screen.getByText(/Você paga na hora/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Confirmar inscrição" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Inscrição feita. Boa pelada!");
    expect(fetchCallsTo("POST", "/api/game-days/g1/registrations")[0].body).toEqual({ paymentMethod: "ON_SITE", receiptUrl: "" });
    expect(router.refresh).toHaveBeenCalled();
  });

  it("PIX: escolher arquivo abre a conferencia, confirmar anexa; enviar sobe o arquivo e depois inscreve", async () => {
    mockFetch({
      "POST /api/uploads": { body: { url: "/api/files/comprovantes/c.png" } },
      "POST /api/game-days/g1/registrations": { body: { id: "r1" } },
    });
    panel();
    await userEvent.upload(await waitFor(() => fileInput()), receiptFile());
    const review = await screen.findByRole("dialog", { name: "Seu comprovante" });
    await userEvent.click(within(review).getByRole("button", { name: /Confirmar/ }));
    expect(screen.getByText("pix.png")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Confirmar inscrição" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Inscrição feita");
    const [upload] = fetchCallsTo("POST", "/api/uploads");
    expect((upload.body as FormData).get("tipo")).toBe("comprovante");
    expect(fetchCallsTo("POST", "/api/game-days/g1/registrations")[0].body).toEqual({
      paymentMethod: "PIX",
      receiptUrl: "/api/files/comprovantes/c.png",
    });
  });

  it("conferencia: cancelar descarta; ver e remover o comprovante ja anexado", async () => {
    mockFetch({});
    panel();
    await userEvent.upload(fileInput(), receiptFile());
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /Cancelar/ }));
    expect(screen.queryByText("pix.png")).toBeNull();

    await userEvent.upload(fileInput(), receiptFile());
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /Confirmar/ }));
    await userEvent.click(screen.getByRole("button", { name: "Ver comprovante" }));
    expect(screen.getByRole("dialog", { name: "Seu comprovante" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));
    await userEvent.click(screen.getByRole("button", { name: "Remover comprovante" }));
    expect(screen.getByRole("button", { name: /Anexar comprovante/ })).toBeInTheDocument();
  });

  it("arquivo invalido ou grande demais e barrado na escolha", async () => {
    mockFetch({});
    panel();
    await userEvent.upload(fileInput(), receiptFile("a.gif", "image/gif"), { applyAccept: false });
    expect(await screen.findByText("Formato inválido. Envie uma imagem JPEG, PNG ou WebP.")).toBeInTheDocument();
    await userEvent.upload(fileInput(), receiptFile("g.png", "image/png", 6 * 1024 * 1024));
    expect(await screen.findByText("Arquivo muito grande. O limite é 5 MB.")).toBeInTheDocument();
  });

  it("erro da API aparece e permite tentar de novo reaproveitando o upload", async () => {
    let attempts = 0;
    mockFetch({
      "POST /api/uploads": { body: { url: "/api/files/comprovantes/c.png" } },
      "POST /api/game-days/g1/registrations": () =>
        ++attempts === 1 ? { status: 409, body: { error: "A pelada já está lotada." } } : { body: { id: "r1" } },
    });
    panel();
    await userEvent.upload(fileInput(), receiptFile());
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /Confirmar/ }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar inscrição" }));
    expect(await screen.findByText("A pelada já está lotada.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Confirmar inscrição" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Inscrição feita");
    expect(fetchCallsTo("POST", "/api/uploads")).toHaveLength(1);
  });

  it("401 no upload ou na inscricao leva ao login com o retorno", async () => {
    setLocation("/game-days/g1");
    mockFetch({ "POST /api/game-days/g1/registrations": { status: 401, body: {} } });
    panel();
    await userEvent.click(await screen.findByRole("button", { name: "Pago no local" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar inscrição" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/login?proximo=%2Fgame-days%2Fg1"));
  });

  it("pelada lotada: aviso e botao desabilitado", async () => {
    panel({ full: true });
    expect(await screen.findByText("A pelada já bateu o limite de jogadores.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar inscrição" })).toBeDisabled();
  });

  it("inscricoes encerradas", async () => {
    panel({ open: false });
    expect(await screen.findByText("As inscrições desta pelada já foram encerradas.")).toBeInTheDocument();
  });
});

describe("RegistrationPanel: sua inscricao e visitante", () => {
  const registration = (overrides: Partial<Registration> = {}): Registration => ({
    id: "r1",
    paymentMethod: "PIX",
    paymentStatus: "PENDING",
    receiptUrl: "/api/files/comprovantes/c.png",
    rejectedReason: null,
    ...overrides,
  });

  it("mostra o estado do pagamento e deixa cancelar enquanto a pelada esta aberta", async () => {
    mockFetch({ "DELETE /api/game-days/g1/registrations": { body: { ok: true } } });
    panel({ registration: registration() });
    expect(await screen.findByText("Aguardando")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar inscrição" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Inscrição cancelada.");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("recusada mostra o motivo; confirmada mostra o tom certo", async () => {
    const first = panel({ registration: registration({ paymentStatus: "REJECTED", rejectedReason: "Valor errado" }) });
    expect(await screen.findByText("Valor errado")).toBeInTheDocument();
    first.unmount();
    panel({ registration: registration({ paymentStatus: "CONFIRMED" }) });
    expect(await screen.findByText("Confirmado")).toBeInTheDocument();
  });

  it("depois dos times montados nao ha cancelar, so a orientacao", async () => {
    panel({ registration: registration(), open: false });
    expect(await screen.findByText(/Os times já foram montados/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar inscrição" })).toBeNull();
  });

  it("erro ao cancelar aparece no cartao", async () => {
    mockFetch({ "DELETE /api/game-days/g1/registrations": { status: 404, body: { error: "Você não está inscrito nesta pelada." } } });
    panel({ registration: registration() });
    await userEvent.click(await screen.findByRole("button", { name: "Cancelar inscrição" }));
    expect(await screen.findByText("Você não está inscrito nesta pelada.")).toBeInTheDocument();
  });

  it("ver meu comprovante abre o modal (e fecha)", async () => {
    panel({ registration: registration() });
    await userEvent.click(await screen.findByRole("button", { name: /Ver meu comprovante/ }));
    expect(screen.getByRole("dialog", { name: "Meu comprovante" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("visitante: 'Quero jogar' leva ao login e volta para a pelada", async () => {
    setLocation("/game-days/g1");
    renderWithProviders(
      <RegistrationPanel gameDayId="g1" price="R$ 10,00" pixKey={null} registration={null} open full={false} guest />,
      { user: null },
    );
    const link = await screen.findByRole("link", { name: /Quero jogar/ });
    expect(link).toHaveAttribute("href", "/login?proximo=%2Fgame-days%2Fg1");
  });

  it("visitante: inscricoes fechadas ou lotada trocam o convite por um aviso", async () => {
    const first = renderWithProviders(
      <RegistrationPanel gameDayId="g1" price="x" pixKey={null} registration={null} open full={false} guest registrationsClosed />,
    );
    expect(await screen.findByText("As inscrições estão fechadas no momento.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Quero jogar/ })).toBeNull();
    first.unmount();
    renderWithProviders(<RegistrationPanel gameDayId="g1" price="x" pixKey={null} registration={null} open full guest />);
    expect(await screen.findByText("A pelada já bateu o limite de jogadores.")).toBeInTheDocument();
  });
});

describe("RegistrationPanel: alterar forma de pagamento", () => {
  const registration = (overrides: Partial<Registration> = {}): Registration => ({
    id: "r1",
    paymentMethod: "ON_SITE",
    paymentStatus: "PENDING",
    receiptUrl: null,
    rejectedReason: null,
    ...overrides,
  });
  const PIX_RECEIPT = "/api/files/comprovantes/c.png";
  const changeButton = () => screen.getByRole("button", { name: "Alterar pagamento" });
  const changeDialog = () => screen.findByRole("dialog", { name: "Alterar forma de pagamento" });

  it("o botao fica ao lado de 'Cancelar inscricao'", async () => {
    panel({ registration: registration() });
    const cancel = await screen.findByRole("button", { name: "Cancelar inscrição" });
    expect(changeButton().parentElement).toBe(cancel.parentElement);
    expect(changeButton()).toBeEnabled();
  });

  it.each([
    ["pagamento no local confirmado", { paymentStatus: "CONFIRMED" }, "O organizador já confirmou o seu pagamento."],
    ["PIX confirmado", { paymentMethod: "PIX", paymentStatus: "CONFIRMED", receiptUrl: PIX_RECEIPT }, "O organizador já confirmou o seu pagamento."],
    [
      "PIX com comprovante aguardando conferencia",
      { paymentMethod: "PIX", receiptUrl: PIX_RECEIPT },
      "Seu comprovante está em análise. Só dá para trocar se o organizador recusá-lo.",
    ],
  ] as const)("%s: botao desabilitado, continua na tela e explica o motivo", async (_name, overrides, reason) => {
    const spy = mockFetch({});
    panel({ registration: registration(overrides) });
    expect(await screen.findByRole("button", { name: "Alterar pagamento" })).toBeDisabled();
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(changeButton()).toHaveAccessibleDescription(reason);
    await userEvent.click(changeButton());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it.each([
    ["no local aguardando", {}],
    ["no local recusado", { paymentStatus: "REJECTED" }],
    ["PIX sem comprovante", { paymentMethod: "PIX" }],
    ["PIX com comprovante recusado", { paymentMethod: "PIX", paymentStatus: "REJECTED", receiptUrl: PIX_RECEIPT, rejectedReason: "Valor errado" }],
  ] as const)("%s: botao habilitado e sem aviso", async (_name, overrides) => {
    panel({ registration: registration(overrides) });
    expect(await screen.findByRole("button", { name: "Alterar pagamento" })).toBeEnabled();
    expect(screen.queryByText(/já confirmou|em análise/)).toBeNull();
  });

  it("depois dos times montados o botao continua, sem o cancelar", async () => {
    panel({ registration: registration(), open: false });
    expect(await screen.findByRole("button", { name: "Alterar pagamento" })).toBeEnabled();
    expect(screen.getByText(/Os times já foram montados/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar inscrição" })).toBeNull();
  });

  it("PIX recusado para no local: confirma, avisa e atualiza a tela, sem enviar comprovante", async () => {
    mockFetch({ "PATCH /api/game-days/g1/registrations": { body: { ok: true } } });
    panel({ registration: registration({ paymentMethod: "PIX", paymentStatus: "REJECTED", receiptUrl: PIX_RECEIPT }) });
    await userEvent.click(await screen.findByRole("button", { name: "Alterar pagamento" }));
    const dialog = await changeDialog();
    expect(within(dialog).getByText(/Você paga na hora/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Anexar comprovante/ })).toBeNull();

    await userEvent.click(within(dialog).getByRole("button", { name: "Alterar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Forma de pagamento alterada.");
    expect(fetchCallsTo("PATCH", "/api/game-days/g1/registrations")[0].body).toEqual({ paymentMethod: "ON_SITE", receiptUrl: "" });
    expect(fetchCallsTo("POST", "/api/uploads")).toHaveLength(0);
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("no local para PIX: pede a chave e o comprovante, sobe o arquivo e troca", async () => {
    mockFetch({
      "POST /api/uploads": { body: { url: "/api/files/comprovantes/novo.png" } },
      "PATCH /api/game-days/g1/registrations": { body: { ok: true } },
    });
    panel({ registration: registration() });
    await userEvent.click(await screen.findByRole("button", { name: "Alterar pagamento" }));
    const dialog = await changeDialog();
    expect(within(dialog).getByText("pix@voacraque.app")).toBeInTheDocument();

    // Sem comprovante nao chama a API.
    await userEvent.click(within(dialog).getByRole("button", { name: "Alterar" }));
    expect(within(dialog).getByText("Anexe o comprovante do PIX.")).toBeInTheDocument();
    expect(fetchCallsTo("PATCH", "/api/game-days/g1/registrations")).toHaveLength(0);

    await userEvent.upload(fileInput(), receiptFile());
    const review = await screen.findByRole("dialog", { name: "Seu comprovante" });
    await userEvent.click(within(review).getByRole("button", { name: /Confirmar/ }));
    expect(within(dialog).getByText("pix.png")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Alterar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Forma de pagamento alterada.");
    const [upload] = fetchCallsTo("POST", "/api/uploads");
    expect((upload.body as FormData).get("tipo")).toBe("comprovante");
    expect(fetchCallsTo("PATCH", "/api/game-days/g1/registrations")[0].body).toEqual({
      paymentMethod: "PIX",
      receiptUrl: "/api/files/comprovantes/novo.png",
    });
    expect(router.refresh).toHaveBeenCalled();
  });

  it("copiar a chave PIX funciona dentro do modal", async () => {
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
    panel({ registration: registration() });
    await userEvent.click(await screen.findByRole("button", { name: "Alterar pagamento" }));
    await userEvent.click(within(await changeDialog()).getByRole("button", { name: /Chave PIX/ }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("pix@voacraque.app");
  });

  it("erro da API aparece no modal, nao no cartao, e deixa tentar de novo reaproveitando o upload", async () => {
    let attempts = 0;
    mockFetch({
      "POST /api/uploads": { body: { url: "/api/files/comprovantes/novo.png" } },
      "PATCH /api/game-days/g1/registrations": () =>
        ++attempts === 1
          ? { status: 409, body: { error: "O organizador acabou de atualizar o seu pagamento. Atualize a página e tente de novo." } }
          : { body: { ok: true } },
    });
    panel({ registration: registration() });
    await userEvent.click(await screen.findByRole("button", { name: "Alterar pagamento" }));
    const dialog = await changeDialog();
    await userEvent.upload(fileInput(), receiptFile());
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Seu comprovante" })).getByRole("button", { name: /Confirmar/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Alterar" }));

    expect(await within(dialog).findByText(/organizador acabou de atualizar/)).toBeInTheDocument();
    expect(screen.getAllByText(/organizador acabou de atualizar/)).toHaveLength(1);
    expect(within(dialog).getByRole("button", { name: "Alterar" })).toBeEnabled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Alterar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Forma de pagamento alterada.");
    expect(fetchCallsTo("POST", "/api/uploads")).toHaveLength(1);
  });

  it("cancelar, X e Esc fecham o modal sem chamar a API e descartam o comprovante escolhido", async () => {
    const spy = mockFetch({});
    panel({ registration: registration() });
    await userEvent.click(await screen.findByRole("button", { name: "Alterar pagamento" }));
    let dialog = await changeDialog();
    await userEvent.upload(fileInput(), receiptFile());
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Seu comprovante" })).getByRole("button", { name: /Confirmar/ }));
    expect(within(dialog).getByText("pix.png")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(changeButton());
    dialog = await changeDialog();
    expect(within(dialog).queryByText("pix.png")).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(changeButton());
    await changeDialog();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("Esc com a conferencia do comprovante aberta fecha so a conferencia", async () => {
    panel({ registration: registration() });
    await userEvent.click(await screen.findByRole("button", { name: "Alterar pagamento" }));
    await changeDialog();
    await userEvent.upload(fileInput(), receiptFile());
    expect(await screen.findByRole("dialog", { name: "Seu comprovante" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Seu comprovante" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Alterar forma de pagamento" })).toBeInTheDocument();
  });

  it("arquivo invalido e barrado dentro do modal", async () => {
    panel({ registration: registration() });
    await userEvent.click(await screen.findByRole("button", { name: "Alterar pagamento" }));
    const dialog = await changeDialog();
    await userEvent.upload(fileInput(), receiptFile("a.gif", "image/gif"), { applyAccept: false });
    expect(await within(dialog).findByText("Formato inválido. Envie uma imagem JPEG, PNG ou WebP.")).toBeInTheDocument();
  });

  it("401 leva ao login com o retorno", async () => {
    setLocation("/game-days/g1");
    mockFetch({ "PATCH /api/game-days/g1/registrations": { status: 401, body: {} } });
    panel({ registration: registration({ paymentMethod: "PIX", paymentStatus: "REJECTED", receiptUrl: PIX_RECEIPT }) });
    await userEvent.click(await screen.findByRole("button", { name: "Alterar pagamento" }));
    await userEvent.click(within(await changeDialog()).getByRole("button", { name: "Alterar" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/login?proximo=%2Fgame-days%2Fg1"));
  });
});

describe("ReceiptModal", () => {
  it("carrega a imagem, mostra o botao de tela cheia e fecha o tela cheia por Esc sem fechar o modal", async () => {
    const onClose = jest.fn();
    render(<ReceiptModal url="/c.png" title="Comprovante de Ana" onClose={onClose} />);
    expect(screen.getByLabelText("Carregando comprovante")).toBeInTheDocument();
    fireEvent.load(screen.getByRole("img", { name: "Comprovante de Ana", hidden: true }));
    await userEvent.click(await screen.findByRole("button", { name: "Ver comprovante em tela cheia" }));
    expect(screen.getByRole("dialog", { name: "Comprovante de Ana em tela cheia" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: /tela cheia/ })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Ver comprovante em tela cheia" }));
    await userEvent.click(screen.getByRole("button", { name: "Fechar tela cheia" }));
    expect(screen.queryByRole("dialog", { name: /tela cheia/ })).toBeNull();
  });

  it("erro de imagem mostra a mensagem", () => {
    render(<ReceiptModal url="/quebrada.png" title="Comprovante" onClose={() => {}} />);
    fireEvent.error(screen.getByRole("img", { hidden: true }));
    expect(screen.getByText("Não foi possível carregar o comprovante.")).toBeInTheDocument();
  });

  it("decisao do organizador: recusar e aprovar; aprovando desabilita", async () => {
    const onReject = jest.fn();
    const onApprove = jest.fn();
    const { rerender } = render(
      <ReceiptModal url="/c.png" title="C" onClose={() => {}} decision={{ busy: false, onReject, onApprove }} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Recusar/ }));
    await userEvent.click(screen.getByRole("button", { name: /Aprovar/ }));
    expect(onReject).toHaveBeenCalled();
    expect(onApprove).toHaveBeenCalled();
    rerender(<ReceiptModal url="/c.png" title="C" onClose={() => {}} decision={{ busy: true, onReject, onApprove }} />);
    expect(screen.getByRole("button", { name: /Aprovando/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Recusar/ })).toBeDisabled();
  });

  it("confirmacao: Esc e X cancelam, Confirmar confirma", async () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    render(<ReceiptModal url="/c.png" title="C" onClose={() => {}} confirmation={{ onCancel, onConfirm }} />);
    await userEvent.click(screen.getByRole("button", { name: /Confirmar/ }));
    await userEvent.keyboard("{Escape}");
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("RejectReasonModal e RemoveRegistrationModal", () => {
  it("recusa devolve o motivo sem espacos nas pontas; cancelar fecha; ocupado trava", async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const { rerender } = render(<RejectReasonModal name="Ana" busy={false} onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByText(/Pagamento de Ana/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Motivo da recusa"), "  valor errado  ");
    await userEvent.click(screen.getByRole("button", { name: "Recusar pagamento" }));
    expect(onConfirm).toHaveBeenCalledWith("valor errado");
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    rerender(<RejectReasonModal name="Ana" busy onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByRole("button", { name: "Recusando..." })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("motivo vazio tambem e valido (opcional)", async () => {
    const onConfirm = jest.fn();
    render(<RejectReasonModal name="Ana" busy={false} onConfirm={onConfirm} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Recusar pagamento" }));
    expect(onConfirm).toHaveBeenCalledWith("");
  });

  it("remover: confirma, cancela e trava enquanto ocupado", async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const { rerender } = render(<RemoveRegistrationModal name="Bruno" busy={false} onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByText(/Remover Bruno da pelada/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remover" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    rerender(<RemoveRegistrationModal name="Bruno" busy onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByRole("button", { name: "Removendo..." })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("botoes do ciclo de vida da pelada", () => {
  it("iniciar: confirma, chama a API e vai para o painel", async () => {
    mockFetch({ "POST /api/game-days/g1/start": { body: { ok: true } } });
    renderWithProviders(<StartGameDayButton gameDayId="g1" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: /Iniciar pelada/ }));
    expect(screen.getByRole("dialog", { name: "Iniciar pelada?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Iniciar" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/game-days/g1/panel"));
  });

  it("iniciar: cancelar fecha; erro da API aparece e destrava o botao", async () => {
    mockFetch({ "POST /api/game-days/g1/start": { status: 409, body: { error: "Monte os times antes de iniciar a pelada." } } });
    renderWithProviders(<StartGameDayButton gameDayId="g1" />);
    await userEvent.click(await screen.findByRole("button", { name: /Iniciar pelada/ }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Iniciar pelada/ }));
    await userEvent.click(screen.getByRole("button", { name: "Iniciar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Monte os times antes de iniciar a pelada.");
    expect(screen.getByRole("button", { name: "Iniciar" })).toBeEnabled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it.each([
    ["encerrar", FinishGameDayButton, /Encerrar pelada/, "Encerrar mesmo", "/api/game-days/g1/finish", "Pelada encerrada. Estatísticas contabilizadas."],
    ["cancelar", CancelGameDayButton, /Cancelar pelada/, "Cancelar mesmo", "/api/game-days/g1/cancel", "Pelada cancelada."],
    ["restaurar", RestoreGameDayButton, /Restaurar/, "Restaurar mesmo", "/api/game-days/g1/restore", "Pelada restaurada. As inscrições estão abertas."],
  ] as const)("%s: pede confirmacao, avisa e atualiza a tela", async (_name, Button, label, confirm, path, toast) => {
    mockFetch({ [`POST ${path}`]: { body: { ok: true } } });
    renderWithProviders(<Button gameDayId="g1" />);
    await userEvent.click(await screen.findByRole("button", { name: label }));
    expect(fetchCallsTo("POST", path)).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByRole("button", { name: label })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: label }));
    await userEvent.click(screen.getByRole("button", { name: confirm }));
    expect(await screen.findByRole("status")).toHaveTextContent(toast);
    expect(router.refresh).toHaveBeenCalled();
    expect(fetchCallsTo("POST", path)).toHaveLength(1);
  });

  it.each([
    ["encerrar", FinishGameDayButton, /Encerrar pelada/, "Encerrar mesmo", "/api/game-days/g1/finish"],
    ["cancelar", CancelGameDayButton, /Cancelar pelada/, "Cancelar mesmo", "/api/game-days/g1/cancel"],
    ["restaurar", RestoreGameDayButton, /Restaurar/, "Restaurar mesmo", "/api/game-days/g1/restore"],
  ] as const)("%s: erro da API vira toast de erro e nao navega", async (_name, Button, label, confirm, path) => {
    mockFetch({ [`POST ${path}`]: { status: 409, body: { error: "Esta pelada já foi encerrada." } } });
    renderWithProviders(<Button gameDayId="g1" />);
    await userEvent.click(await screen.findByRole("button", { name: label }));
    await userEvent.click(screen.getByRole("button", { name: confirm }));
    expect(await screen.findByRole("status")).toHaveTextContent("Esta pelada já foi encerrada.");
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("cancelar e restaurar levam de volta para a pagina da pelada", async () => {
    mockFetch({
      "POST /api/game-days/g1/cancel": { body: {} },
      "POST /api/game-days/g1/restore": { body: {} },
    });
    const first = renderWithProviders(<CancelGameDayButton gameDayId="g1" />);
    await userEvent.click(await screen.findByRole("button", { name: /Cancelar pelada/ }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar mesmo" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/game-days/g1"));
    first.unmount();
    router.push.mockClear();
    renderWithProviders(<RestoreGameDayButton gameDayId="g1" />);
    await userEvent.click(await screen.findByRole("button", { name: /Restaurar/ }));
    await userEvent.click(screen.getByRole("button", { name: "Restaurar mesmo" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/game-days/g1"));
  });

  it("encerrar aceita a variante secundaria e className", async () => {
    renderWithProviders(<FinishGameDayButton gameDayId="g1" variant="secondary" className="w-full" />);
    expect(await screen.findByRole("button", { name: /Encerrar pelada/ })).toHaveClass("w-full", "bg-night-700");
  });
});
