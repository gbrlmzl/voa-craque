import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuditTable, type AuditRow } from "@/components/admin/AuditTable";
import { RatingRecompute } from "@/components/admin/RatingRecompute";
import { RoleManager, type ManagedUser } from "@/components/admin/RoleManager";
import { SystemSettingsForm } from "@/components/admin/SystemSettingsForm";
import { PlayerEvaluation, type EvaluationPlayer } from "@/components/PlayerEvaluation";
import { fetchCallsTo, mockFetch } from "../../helpers/fetch-mock";
import { router } from "../../helpers/next-navigation";
import { renderWithProviders, SUPERADMIN } from "../../helpers/render";

const player = (overrides: Partial<EvaluationPlayer> & { userId: string; name: string }): EvaluationPlayer => ({
  nickname: null,
  photoUrl: null,
  positionLabel: "Ala",
  stars: null,
  starsUpdatedAt: null,
  mmr: null,
  mmrRank: null,
  ...overrides,
});

describe("PlayerEvaluation", () => {
  const players = [
    player({ userId: "a", name: "Ana", nickname: "Aninha", stars: 4, starsUpdatedAt: "2030-05-01T12:00:00.000Z", mmr: 1032.4, mmrRank: 1 }),
    player({ userId: "b", name: "Bruno", stars: 3 }),
    player({ userId: "c", name: "Caio" }),
  ];
  const open = () => renderWithProviders(<PlayerEvaluation players={players} />, { user: SUPERADMIN });

  it("avisa quantos jogadores estao sem estrelas e mostra data e ranking de quem tem", async () => {
    open();
    expect(await screen.findByText(/1 jogador ainda não tem estrelas/)).toBeInTheDocument();
    expect(screen.getByText(/avaliado em 01\/05\/2030/)).toBeInTheDocument();
    expect(screen.getByText("sem data de avaliação")).toBeInTheDocument();
    expect(screen.getByText("1º no ranking · MMR 1.032")).toBeInTheDocument();
  });

  it("varios sem nota: texto no plural", async () => {
    renderWithProviders(<PlayerEvaluation players={[player({ userId: "x", name: "X" }), player({ userId: "y", name: "Y" })]} />);
    expect(await screen.findByText(/2 jogadores ainda não têm estrelas/)).toBeInTheDocument();
  });

  it("busca por nome ou apelido; sem resultado mostra o vazio", async () => {
    open();
    await userEvent.type(await screen.findByPlaceholderText("Buscar jogador"), "anin");
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.queryByText("Bruno")).toBeNull();
    await userEvent.clear(screen.getByPlaceholderText("Buscar jogador"));
    await userEvent.type(screen.getByPlaceholderText("Buscar jogador"), "zzz");
    expect(screen.getByText("Nenhum jogador encontrado")).toBeInTheDocument();
  });

  it("abrir um jogador mostra os passos de estrela; so um fica aberto por vez", async () => {
    open();
    await userEvent.click(await screen.findByRole("button", { name: /Bruno/ }));
    expect(screen.getByRole("button", { name: "4,5" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Caio/ }));
    expect(screen.getAllByRole("button", { name: "sem nota" })).toHaveLength(1);
  });

  it("salvar fica desabilitado ate mudar a nota; grava por PATCH e avisa", async () => {
    mockFetch({ "PATCH /api/players/b/evaluation": { body: { ok: true } } });
    open();
    await userEvent.click(await screen.findByRole("button", { name: /Bruno/ }));
    const save = screen.getByRole("button", { name: "Salvar avaliação" });
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "4,5" }));
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(await screen.findByRole("status")).toHaveTextContent("Bruno avaliado.");
    expect(fetchCallsTo("PATCH", "/api/players/b/evaluation")[0].body).toEqual({ stars: 4.5 });
    expect(router.refresh).toHaveBeenCalled();
  });

  it("'sem nota' envia null", async () => {
    mockFetch({ "PATCH /api/players/b/evaluation": { body: { ok: true } } });
    open();
    await userEvent.click(await screen.findByRole("button", { name: /Bruno/ }));
    await userEvent.click(screen.getByRole("button", { name: "sem nota" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar avaliação" }));
    await screen.findByRole("status");
    expect(fetchCallsTo("PATCH", "/api/players/b/evaluation")[0].body).toEqual({ stars: null });
  });

  it("erro do servidor vira toast de erro", async () => {
    mockFetch({ "PATCH /api/players/b/evaluation": { status: 422, body: { error: "As estrelas vao de 1 a 5." } } });
    open();
    await userEvent.click(await screen.findByRole("button", { name: /Bruno/ }));
    await userEvent.click(screen.getByRole("button", { name: "1,0" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar avaliação" }));
    expect(await screen.findByRole("status")).toHaveTextContent("As estrelas vao de 1 a 5.");
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe("RoleManager", () => {
  const users: ManagedUser[] = [
    { id: "me", name: "Super", email: "super@x.com", photoUrl: null, role: "SUPERADMIN", hasProfile: true },
    { id: "u1", name: "Ana", email: "ana@x.com", photoUrl: null, role: "USER", hasProfile: true },
    { id: "u2", name: "novo", email: "novo@x.com", photoUrl: null, role: "USER", hasProfile: false },
  ];

  it("a propria conta nao muda de papel; quem nao tem perfil aparece sem ficha", async () => {
    renderWithProviders(<RoleManager users={users} currentUserId="me" />, { user: SUPERADMIN });
    expect(await screen.findByLabelText("Papel de Super")).toBeDisabled();
    expect(screen.getByLabelText("Papel de Ana")).toBeEnabled();
    expect(screen.getByText(/novo@x.com · sem perfil/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ana/ })).toBeInTheDocument();
  });

  it("promover grava, avisa com o nome do papel e atualiza", async () => {
    mockFetch({ "PATCH /api/users/u1/role": { body: { ok: true } } });
    renderWithProviders(<RoleManager users={users} currentUserId="me" />, { user: SUPERADMIN });
    await userEvent.selectOptions(await screen.findByLabelText("Papel de Ana"), "ADMIN");
    expect(await screen.findByRole("status")).toHaveTextContent("Ana agora é Organizador.");
    expect(fetchCallsTo("PATCH", "/api/users/u1/role")[0].body).toEqual({ role: "ADMIN" });
    expect(router.refresh).toHaveBeenCalled();
  });

  it("erro do servidor vira toast", async () => {
    mockFetch({ "PATCH /api/users/u1/role": { status: 403, body: { error: "Ação restrita ao superadmin." } } });
    renderWithProviders(<RoleManager users={users} currentUserId="me" />, { user: SUPERADMIN });
    await userEvent.selectOptions(await screen.findByLabelText("Papel de Ana"), "SUPERADMIN");
    expect(await screen.findByRole("status")).toHaveTextContent("Ação restrita ao superadmin.");
  });
});

describe("RatingRecompute", () => {
  it("pede confirmacao e conta as peladas (singular e plural)", async () => {
    const first = renderWithProviders(<RatingRecompute ratedGameDays={1} />, { user: SUPERADMIN });
    expect(await screen.findByText(/\(1 contabilizada\)/)).toBeInTheDocument();
    first.unmount();
    renderWithProviders(<RatingRecompute ratedGameDays={3} />, { user: SUPERADMIN });
    expect(await screen.findByText(/\(3 contabilizadas\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Recalcular o MMR/ }));
    expect(screen.getByRole("button", { name: /Recalcular mesmo assim/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("button", { name: /Recalcular o MMR/ })).toBeInTheDocument();
  });

  it("confirmar chama a API e avisa o total", async () => {
    mockFetch({ "POST /api/admin/rating/recompute": { body: { gameDays: 3, players: 14 } } });
    renderWithProviders(<RatingRecompute ratedGameDays={3} />, { user: SUPERADMIN });
    await userEvent.click(await screen.findByRole("button", { name: /Recalcular o MMR/ }));
    await userEvent.click(screen.getByRole("button", { name: /Recalcular mesmo assim/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("MMR recomputado: 3 peladas, 14 jogadores.");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("erro do servidor e mostrado e a confirmacao continua aberta", async () => {
    mockFetch({ "POST /api/admin/rating/recompute": { status: 403, body: { error: "Ação restrita ao superadmin." } } });
    renderWithProviders(<RatingRecompute ratedGameDays={3} />, { user: SUPERADMIN });
    await userEvent.click(await screen.findByRole("button", { name: /Recalcular o MMR/ }));
    await userEvent.click(screen.getByRole("button", { name: /Recalcular mesmo assim/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("Ação restrita ao superadmin.");
    expect(screen.getByRole("button", { name: /Recalcular mesmo assim/ })).toBeEnabled();
  });
});

describe("SystemSettingsForm", () => {
  const initial = { publicAccessEnabled: true, privateSiteEnabled: false, registrationOpen: true, maintenanceMessage: "Voltamos ja." };
  const toggle = (label: string) => screen.getByText(label).closest("button")!;

  it("alterna as tres chaves e envia o que esta na tela", async () => {
    mockFetch({ "PATCH /api/system": { body: { ok: true } } });
    renderWithProviders(<SystemSettingsForm initial={initial} />, { user: SUPERADMIN });
    await userEvent.click(await screen.findByText("Site privado"));
    await userEvent.click(screen.getByText("Inscrições abertas"));
    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "Em obras");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Configuração salva.");
    expect(fetchCallsTo("PATCH", "/api/system")[0].body).toEqual({
      publicAccessEnabled: true,
      privateSiteEnabled: true,
      registrationOpen: false,
      maintenanceMessage: "Em obras",
    });
    expect(router.refresh).toHaveBeenCalled();
    expect(toggle("Site privado")).toBeInTheDocument();
  });

  it("desligar o site liberado mostra o aviso de manutencao", async () => {
    renderWithProviders(<SystemSettingsForm initial={initial} />, { user: SUPERADMIN });
    expect(screen.queryByText(/O site está em manutenção/)).toBeNull();
    await userEvent.click(await screen.findByText("Site liberado"));
    expect(screen.getByText(/O site está em manutenção: ninguém navega/)).toBeInTheDocument();
  });

  it("erro do servidor vira toast de erro", async () => {
    mockFetch({ "PATCH /api/system": { status: 422, body: { error: "Dados inválidos." } } });
    renderWithProviders(<SystemSettingsForm initial={initial} />, { user: SUPERADMIN });
    await userEvent.click(await screen.findByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Dados inválidos.");
  });
});

describe("AuditTable", () => {
  const row = (overrides: Partial<AuditRow> = {}): AuditRow => ({
    id: "1",
    createdAt: "2030-05-10T12:00:00.000Z",
    actorName: "Super",
    actorEmail: "super@x.com",
    actorRole: "SUPERADMIN",
    action: "GAMEDAY_FINISHED",
    entity: "GameDay",
    entityId: "g1",
    summary: "Pelada encerrada",
    before: { status: "LIVE" },
    after: { status: "FINISHED" },
    ip: "203.0.113.7",
    userAgent: "jest",
    ...overrides,
  });

  it("sem registros mostra o vazio", () => {
    renderWithProviders(<AuditTable rows={[]} />);
    expect(screen.getByText("Nenhum registro no filtro")).toBeInTheDocument();
  });

  it("cada registro mostra acao, quem fez, ip e entidade; expandir mostra antes e depois", async () => {
    renderWithProviders(<AuditTable rows={[row()]} />);
    expect(screen.getAllByText("Pelada encerrada").length).toBeGreaterThanOrEqual(1); // selo da acao e resumo
    expect(screen.getByText(/Super \(super@x.com\) · SUPERADMIN · 203.0.113.7/)).toBeInTheDocument();
    expect(screen.getByText(/GameDay#g1 · jest/)).toBeInTheDocument();
    expect(screen.queryByText("Antes")).toBeNull();
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Antes")).toBeInTheDocument();
    expect(screen.getByText(/"status": "FINISHED"/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button"));
    expect(screen.queryByText("Antes")).toBeNull();
  });

  it("acao do sistema, sem resumo e sem diff: nao expande", async () => {
    renderWithProviders(
      <AuditTable rows={[row({ actorName: null, actorEmail: null, actorRole: null, ip: null, userAgent: null, summary: null, entityId: null, before: null, after: null, action: "ACAO_NOVA" })]} />,
    );
    expect(screen.getByText("Sistema")).toBeInTheDocument();
    expect(screen.getByText("ACAO_NOVA")).toBeInTheDocument();
    expect(screen.getAllByText("GameDay").length).toBeGreaterThanOrEqual(1); // sem resumo, o titulo cai na entidade
    await userEvent.click(screen.getByRole("button"));
    expect(screen.queryByText("Antes")).toBeNull();
  });

  it("so um dos lados do diff: o outro vira traco", async () => {
    renderWithProviders(<AuditTable rows={[row({ before: null })]} />);
    await userEvent.click(screen.getByRole("button"));
    expect(within(screen.getByText("Antes").parentElement!).getByText("—")).toBeInTheDocument();
  });

  it.each([
    ["MATCH_EVENT_UNDONE", "bad"],
    ["PAYMENT_REJECTED", "bad"],
    ["REGISTRATION_CANCELLED", "bad"],
    ["PAYMENT_CONFIRMED", "good"],
    ["USER_ROLE_CHANGED", "warn"],
    ["SYSTEM_SETTINGS_UPDATED", "warn"],
    ["TEAMS_DRAWN", "neutral"],
  ])("tom do selo de %s e %s", async (action, tone) => {
    renderWithProviders(<AuditTable rows={[row({ action })]} />);
    const expectedClass = ({ bad: "text-rose-300", good: "text-pitch-300", warn: "text-amber-300", neutral: "text-slate-300" } as Record<string, string>)[tone];
    const badge = document.querySelector("span.rounded-full") as HTMLElement;
    expect(badge).toHaveClass(expectedClass);
  });
});
