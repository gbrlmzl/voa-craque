import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminRegistrationModal } from "@/components/gameday/AdminRegistrationModal";
import { PaymentList } from "@/components/gameday/PaymentList";
import type { PaymentRow } from "@/hooks/usePaymentList";
import { fetchCallsTo, mockFetch } from "../../helpers/fetch-mock";
import { router } from "../../helpers/next-navigation";
import { ADMIN, renderWithProviders } from "../../helpers/render";

const rows: PaymentRow[] = [
  { id: "r1", userId: "u1", name: "Ana", photoUrl: null, paymentMethod: "PIX", paymentStatus: "PENDING", receiptUrl: "/api/files/comprovantes/a.png" },
  { id: "r2", userId: "u2", name: "Bruno", photoUrl: null, paymentMethod: "ON_SITE", paymentStatus: "CONFIRMED", receiptUrl: null },
  { id: "r3", userId: "u3", name: "Caio", photoUrl: null, paymentMethod: "PIX", paymentStatus: "REJECTED", receiptUrl: null },
];

async function openPayments(list: PaymentRow[] = rows) {
  renderWithProviders(<PaymentList gameDayId="g1" rows={list} />, { user: ADMIN });
  await userEvent.click(await screen.findByRole("button", { name: /Pagamentos/ }));
  return screen.getByRole("dialog", { name: "Pagamentos" });
}

describe("PaymentList", () => {
  it("o botao resume o estado: aguardando, tudo conferido, ninguem inscrito", async () => {
    const first = renderWithProviders(<PaymentList gameDayId="g1" rows={rows} />, { user: ADMIN });
    expect(await screen.findByText("1 aguardando")).toBeInTheDocument();
    first.unmount();
    const second = renderWithProviders(<PaymentList gameDayId="g1" rows={rows.slice(1)} />, { user: ADMIN });
    expect(await screen.findByText("tudo conferido")).toBeInTheDocument();
    second.unmount();
    renderWithProviders(<PaymentList gameDayId="g1" rows={[]} />, { user: ADMIN });
    expect(await screen.findByText("ninguém inscrito")).toBeInTheDocument();
  });

  it("lista cada inscrito com metodo, estado e as acoes certas para cada estado", async () => {
    const dialog = await openPayments();
    expect(within(dialog).getByText("Ana")).toBeInTheDocument();
    expect(within(dialog).getByText("Pago no local")).toBeInTheDocument();
    expect(within(dialog).getByText("Confirmado")).toBeInTheDocument();
    expect(within(dialog).getByText("Recusado")).toBeInTheDocument();
    // Ana: confirmar e recusar; Bruno (confirmado): desfazer
    expect(within(dialog).getByRole("button", { name: "Confirmar pagamento de Ana" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Desfazer confirmação de Bruno" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Confirmar pagamento de Bruno" })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Comprovante de Ana" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Comprovante de Bruno" })).toBeNull();
  });

  it("sem inscritos mostra o vazio", async () => {
    const dialog = await openPayments([]);
    expect(within(dialog).getByText("Ninguém se inscreveu ainda")).toBeInTheDocument();
  });

  it("confirmar chama a API, avisa e atualiza a tela", async () => {
    mockFetch({ "PATCH /api/game-days/g1/registrations/r1": { body: { ok: true } } });
    const dialog = await openPayments();
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirmar pagamento de Ana" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Pagamento de Ana confirmado.");
    expect(fetchCallsTo("PATCH", "/api/game-days/g1/registrations/r1")[0].body).toEqual({ paymentStatus: "CONFIRMED", rejectedReason: "" });
    expect(router.refresh).toHaveBeenCalled();
  });

  it("desfazer a confirmacao volta para pendente", async () => {
    mockFetch({ "PATCH /api/game-days/g1/registrations/r2": { body: { ok: true } } });
    const dialog = await openPayments();
    await userEvent.click(within(dialog).getByRole("button", { name: "Desfazer confirmação de Bruno" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Pagamento de Bruno voltou para pendente.");
    expect(fetchCallsTo("PATCH", "/api/game-days/g1/registrations/r2")[0].body).toMatchObject({ paymentStatus: "PENDING" });
  });

  it("recusar abre o motivo e envia com o texto digitado", async () => {
    mockFetch({ "PATCH /api/game-days/g1/registrations/r1": { body: { ok: true } } });
    const dialog = await openPayments();
    await userEvent.click(within(dialog).getByRole("button", { name: "Recusar pagamento de Ana" }));
    await userEvent.type(screen.getByLabelText("Motivo da recusa"), "valor errado");
    await userEvent.click(screen.getByRole("button", { name: "Recusar pagamento" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Pagamento de Ana recusado.");
    expect(fetchCallsTo("PATCH", "/api/game-days/g1/registrations/r1")[0].body).toEqual({ paymentStatus: "REJECTED", rejectedReason: "valor errado" });
    await waitFor(() => expect(screen.queryByLabelText("Motivo da recusa")).toBeNull());
  });

  it("comprovante: aprovar pelo modal, ou recusar levando ao motivo", async () => {
    mockFetch({ "PATCH /api/game-days/g1/registrations/r1": { body: { ok: true } } });
    const dialog = await openPayments();
    await userEvent.click(within(dialog).getByRole("button", { name: "Comprovante de Ana" }));
    const receipt = screen.getByRole("dialog", { name: "Comprovante de Ana" });
    await userEvent.click(within(receipt).getByRole("button", { name: /Aprovar/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("Pagamento de Ana confirmado.");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Comprovante de Ana" })).toBeNull());

    await userEvent.click(within(screen.getByRole("dialog", { name: "Pagamentos" })).getByRole("button", { name: "Comprovante de Ana" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Comprovante de Ana" })).getByRole("button", { name: /Recusar/ }));
    expect(screen.getByLabelText("Motivo da recusa")).toBeInTheDocument();
  });

  it("comprovante de pagamento ja confirmado nao oferece decisao", async () => {
    const confirmed = rows.map((row) => (row.id === "r1" ? { ...row, paymentStatus: "CONFIRMED" as const } : row));
    const dialog = await openPayments(confirmed);
    await userEvent.click(within(dialog).getByRole("button", { name: "Comprovante de Ana" }));
    const receipt = screen.getByRole("dialog", { name: "Comprovante de Ana" });
    expect(within(receipt).queryByRole("button", { name: /Aprovar/ })).toBeNull();
  });

  it("erro da API vira toast de erro e o modal continua aberto", async () => {
    mockFetch({ "PATCH /api/game-days/g1/registrations/r1": { status: 500, body: { error: "Erro interno do servidor." } } });
    const dialog = await openPayments();
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirmar pagamento de Ana" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Erro interno do servidor.");
    expect(screen.getByRole("dialog", { name: "Pagamentos" })).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("remover: confirma, chama DELETE, fecha o modal e avisa; cancelar so fecha a confirmacao", async () => {
    mockFetch({ "DELETE /api/game-days/g1/registrations/r3": { body: { ok: true } } });
    const dialog = await openPayments();
    await userEvent.click(within(dialog).getByRole("button", { name: "Remover inscrição de Caio" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog", { name: "Remover inscrição" })).toBeNull();

    await userEvent.click(within(screen.getByRole("dialog", { name: "Pagamentos" })).getByRole("button", { name: "Remover inscrição de Caio" }));
    await userEvent.click(screen.getByRole("button", { name: "Remover" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Inscrição de Caio removida.");
    expect(screen.queryByRole("dialog", { name: "Pagamentos" })).toBeNull();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("erro ao remover (quem esta num time) aparece e preserva a lista", async () => {
    mockFetch({ "DELETE /api/game-days/g1/registrations/r3": { status: 409, body: { error: "Caio está num time." } } });
    const dialog = await openPayments();
    await userEvent.click(within(dialog).getByRole("button", { name: "Remover inscrição de Caio" }));
    await userEvent.click(screen.getByRole("button", { name: "Remover" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Caio está num time.");
  });

  it("Esc fecha so o modal de cima", async () => {
    await openPayments();
    await userEvent.click(screen.getByRole("button", { name: "Remover inscrição de Caio" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Remover inscrição" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Pagamentos" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Pagamentos" })).toBeNull();
  });
});

describe("AdminRegistrationModal", () => {
  const candidates = [
    { userId: "c1", name: "Ana", nickname: "Aninha", photoUrl: null, positionLabel: "Ala", stars: 4, profileCompleted: true },
    { userId: "c2", name: "Bruno", nickname: null, photoUrl: null, positionLabel: "Fixo", stars: null, profileCompleted: false },
    { userId: "c3", name: "Caio", nickname: null, photoUrl: null, positionLabel: "Pivô", stars: 3, profileCompleted: true },
  ];
  const routes = { "GET /api/game-days/g1/registrations/candidates": { body: { candidates } } };

  async function open(props: Partial<React.ComponentProps<typeof AdminRegistrationModal>> = {}) {
    renderWithProviders(
      <AdminRegistrationModal gameDayId="g1" status="OPEN" matchStarted={false} registeredCount={8} maxPlayers={10} {...props} />,
      { user: ADMIN },
    );
    await userEvent.click(await screen.findByRole("button", { name: /Inscrever jogadores/ }));
    return screen.getByRole("dialog", { name: "Inscrever jogadores" });
  }

  it("carrega os candidatos, mostra vagas e avisa quem esta com perfil incompleto", async () => {
    mockFetch(routes);
    const dialog = await open();
    expect(await within(dialog).findByText("Ana (Aninha)")).toBeInTheDocument();
    expect(within(dialog).getByText("8/10 inscritos · 2 vagas")).toBeInTheDocument();
    expect(within(dialog).getByText("Perfil incompleto")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Inscrever 0 jogadores" })).toBeDisabled();
  });

  it("busca por nome ou apelido", async () => {
    mockFetch(routes);
    const dialog = await open();
    await within(dialog).findByText("Ana (Aninha)");
    await userEvent.type(within(dialog).getByLabelText("Buscar por nome ou apelido"), "anin");
    expect(within(dialog).getByText("Ana (Aninha)")).toBeInTheDocument();
    expect(within(dialog).queryByText("Bruno")).toBeNull();
    await userEvent.clear(within(dialog).getByLabelText("Buscar por nome ou apelido"));
    await userEvent.type(within(dialog).getByLabelText("Buscar por nome ou apelido"), "zzz");
    expect(within(dialog).getByText("Ninguém com esse nome.")).toBeInTheDocument();
  });

  it("nao deixa escolher mais gente do que as vagas", async () => {
    mockFetch(routes);
    const dialog = await open();
    for (const name of ["Ana (Aninha)", "Bruno", "Caio"]) await userEvent.click(await within(dialog).findByRole("checkbox", { name: new RegExp(name.replace(/[()]/g, "\\$&")) }));
    expect(within(dialog).getByText("Não há mais vagas. Aumente o limite em Editar pelada.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Inscrever 2 jogadores" })).toBeEnabled();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Bruno/ }));
    expect(within(dialog).getByRole("button", { name: "Inscrever jogador" })).toBeEnabled();
  });

  it("inscreve com o metodo e 'ja recebi o pagamento', avisa e oferece desfazer", async () => {
    mockFetch({
      ...routes,
      "POST /api/game-days/g1/registrations/admin": {
        body: { asReserve: false, created: [{ registrationId: "rg1", userId: "c1", name: "Ana" }] },
      },
      "DELETE /api/game-days/g1/registrations/rg1": { body: { ok: true } },
    });
    const dialog = await open();
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Ana/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "PIX" }));
    await userEvent.click(within(dialog).getByLabelText(/Já recebi o pagamento/));
    await userEvent.click(within(dialog).getByRole("button", { name: "Inscrever jogador" }));

    const toast = await screen.findByRole("status");
    expect(toast).toHaveTextContent("Ana inscrito.");
    expect(fetchCallsTo("POST", "/api/game-days/g1/registrations/admin")[0].body).toEqual({ userIds: ["c1"], paymentMethod: "PIX", alreadyPaid: true });
    expect(screen.queryByRole("dialog", { name: "Inscrever jogadores" })).toBeNull();
    expect(router.refresh).toHaveBeenCalled();

    await userEvent.click(within(toast).getByRole("button", { name: "Desfazer" }));
    await waitFor(() => expect(fetchCallsTo("DELETE", "/api/game-days/g1/registrations/rg1")).toHaveLength(1));
    expect(await screen.findByText("Inscrição desfeita.")).toBeInTheDocument();
  });

  it("varios jogadores como reserva (pelada com times montados)", async () => {
    mockFetch({
      ...routes,
      "POST /api/game-days/g1/registrations/admin": {
        body: { asReserve: true, created: [{ registrationId: "a", userId: "c1", name: "Ana" }, { registrationId: "b", userId: "c3", name: "Caio" }] },
      },
    });
    const dialog = await open({ status: "TEAMS_SET" });
    expect(within(dialog).getByText(/Os times já foram montados/)).toBeInTheDocument();
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Ana/ }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Caio/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Inscrever 2 jogadores" }));
    expect(await screen.findByRole("status")).toHaveTextContent("2 jogadores inscritos como reserva.");
  });

  it("pelada ao vivo explica que entra por substituicao", async () => {
    mockFetch(routes);
    const dialog = await open({ status: "LIVE", matchStarted: true });
    expect(within(dialog).getByText(/Quem você inscrever entra como reserva e pode entrar por substituição/)).toBeInTheDocument();
  });

  it("erro da API fica no modal; erro ao carregar oferece tentar de novo; lista vazia", async () => {
    mockFetch({
      ...routes,
      "POST /api/game-days/g1/registrations/admin": { status: 409, body: { error: "Ana já está inscrito nesta pelada." } },
    });
    const dialog = await open();
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Ana/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Inscrever jogador" }));
    expect(await within(dialog).findByText("Ana já está inscrito nesta pelada.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Inscrever jogadores" })).toBeInTheDocument();
  });

  it("falha ao carregar: mensagem e 'Tentar de novo' recarrega", async () => {
    let attempts = 0;
    mockFetch({
      "GET /api/game-days/g1/registrations/candidates": () =>
        ++attempts === 1 ? { status: 500, body: { error: "Não foi possível carregar os jogadores." } } : { body: { candidates: [] } },
    });
    const dialog = await open();
    expect(await within(dialog).findByText("Não foi possível carregar os jogadores.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Tentar de novo" }));
    expect(await within(dialog).findByText("Todo mundo já está inscrito nesta pelada.")).toBeInTheDocument();
  });

  it("fecha pelo X e reabre limpo", async () => {
    mockFetch(routes);
    const dialog = await open();
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Ana/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Inscrever jogadores/ }));
    expect(await screen.findByRole("button", { name: "Inscrever 0 jogadores" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
  });
});
