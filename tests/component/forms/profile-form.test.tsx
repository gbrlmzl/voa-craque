import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileForm } from "@/components/forms/ProfileForm";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { EMPTY_PROFILE, type ProfileValues } from "@/lib/profile-defaults";
import { fetchCallsTo, mockFetch } from "../../helpers/fetch-mock";
import { router } from "../../helpers/next-navigation";
import { renderWithProviders } from "../../helpers/render";

const SAVED: ProfileValues = {
  ...EMPTY_PROFILE,
  name: "Gabriel Souza",
  nickname: "Gabi",
  foot: "LEFT",
  position: "ALA",
  age: "28",
  heightCm: "178",
  weightKg: "74",
  photoUrl: "/api/files/fotos/a.webp",
  stars: 4,
};

const image = (name = "foto.png", type = "image/png", size = 1000) =>
  new File([new Uint8Array(size)], name, { type });

describe("ProfileForm: edicao", () => {
  it("abre somente leitura, com os dados e a foto; o lapis libera a edicao", async () => {
    renderWithProviders(<ProfileForm initial={SAVED} mode="edit" />);
    expect(await screen.findByText("Gabriel Souza")).toBeInTheDocument();
    expect(screen.getByText("Canhoto")).toBeInTheDocument();
    expect(screen.getByText("Ala")).toBeInTheDocument();
    expect(screen.getByText("178 cm")).toBeInTheDocument();
    expect(screen.getByText("74 kg")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Editar dados" }));
    expect(screen.getByDisplayValue("Gabriel Souza")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeInTheDocument();
  });

  it("a foto no modo leitura abre o zoom e fecha por Esc", async () => {
    renderWithProviders(<ProfileForm initial={SAVED} mode="edit" />);
    await userEvent.click(await screen.findByRole("button", { name: "Ver foto em tamanho maior" }));
    expect(screen.getByRole("dialog", { name: "Foto de Gabriel Souza" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("campos vazios mostram traco; sem foto nao ha zoom", async () => {
    renderWithProviders(<ProfileForm initial={{ ...SAVED, nickname: "", photoUrl: "", heightCm: "", weightKg: "" }} mode="edit" />);
    expect((await screen.findAllByText("—")).length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByRole("button", { name: "Ver foto em tamanho maior" })).toBeNull();
  });

  it("salva por PUT /api/profile com os valores editados, avisa com toast e volta ao modo leitura", async () => {
    mockFetch({ "PUT /api/profile": { body: { ok: true } } });
    renderWithProviders(<ProfileForm initial={SAVED} mode="edit" />);
    await userEvent.click(await screen.findByRole("button", { name: "Editar dados" }));

    const name = screen.getByDisplayValue("Gabriel Souza");
    await userEvent.clear(name);
    await userEvent.type(name, "Gabriel S.");
    await userEvent.selectOptions(screen.getByDisplayValue("Canhoto"), "BOTH");
    await userEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Perfil atualizado.");
    const [call] = fetchCallsTo("PUT", "/api/profile");
    expect(call.body).toMatchObject({ name: "Gabriel S.", foot: "BOTH", position: "ALA", age: "28" });
    expect(screen.queryByRole("button", { name: "Salvar alterações" })).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("erro por campo do servidor volta nos campos e a mensagem geral aparece", async () => {
    mockFetch({
      "PUT /api/profile": { status: 422, body: { error: "Dados inválidos.", details: { age: "Idade minima 14 anos." } } },
    });
    renderWithProviders(<ProfileForm initial={SAVED} mode="edit" />);
    await userEvent.click(await screen.findByRole("button", { name: "Editar dados" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Idade minima 14 anos.")).toBeInTheDocument();
    expect(screen.getByText("Dados inválidos.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeEnabled();
  });

  it("cancelar sem alteracao volta direto; com alteracao pergunta antes de descartar", async () => {
    renderWithProviders(<ProfileForm initial={SAVED} mode="edit" />);
    await userEvent.click(await screen.findByRole("button", { name: "Editar dados" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("button", { name: "Salvar alterações" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Editar dados" }));
    await userEvent.type(screen.getByDisplayValue("Gabriel Souza"), "!");
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("dialog", { name: "Descartar alterações?" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(screen.getByDisplayValue("Gabriel Souza!")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await userEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(screen.queryByRole("button", { name: "Salvar alterações" })).toBeNull();
    expect(screen.getByText("Gabriel Souza")).toBeInTheDocument();
  });

  it("com alteracao pendente, clicar num link do app pergunta antes de sair", async () => {
    renderWithProviders(
      <>
        <a href="/ranking">Ranking</a>
        <ProfileForm initial={SAVED} mode="edit" />
      </>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Editar dados" }));
    await userEvent.type(screen.getByDisplayValue("Gabriel Souza"), "!");
    await userEvent.click(screen.getByRole("link", { name: "Ranking" }));
    expect(screen.getByRole("dialog", { name: "Descartar alterações?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("ProfileForm: foto", () => {
  const profileRoutes = {
    "POST /api/uploads": { body: { url: "/api/files/fotos/nova.webp" } },
    "PUT /api/profile": { body: { ok: true } },
  };

  async function startEditing() {
    renderWithProviders(<ProfileForm initial={SAVED} mode="edit" />);
    await userEvent.click(await screen.findByRole("button", { name: "Editar dados" }));
  }
  const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

  it("escolher foto mostra previa local, avisa que so envia ao salvar e permite desfazer", async () => {
    mockFetch({});
    await startEditing();
    await userEvent.upload(fileInput(), image());
    expect(await screen.findByText("Foto nova. Ela só é enviada quando você salvar.")).toBeInTheDocument();
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Trocar foto" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Desfazer foto" }));
    expect(screen.queryByText(/Foto nova/)).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:teste");
  });

  it("ao salvar, envia a foto antes e grava a URL nova no perfil", async () => {
    mockFetch(profileRoutes);
    await startEditing();
    await userEvent.upload(fileInput(), image());
    await userEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Perfil atualizado.");

    const [upload] = fetchCallsTo("POST", "/api/uploads");
    expect((upload.body as FormData).get("tipo")).toBe("foto");
    expect(fetchCallsTo("PUT", "/api/profile")[0].body).toMatchObject({ photoUrl: "/api/files/fotos/nova.webp" });
  });

  it("formato invalido e arquivo grande demais sao barrados antes de qualquer envio", async () => {
    mockFetch({});
    await startEditing();
    await userEvent.upload(fileInput(), image("a.gif", "image/gif"), { applyAccept: false });
    expect(await screen.findByText("Formato inválido. Envie uma imagem JPEG, PNG ou WebP.")).toBeInTheDocument();
    await userEvent.upload(fileInput(), image("g.png", "image/png", 21 * 1024 * 1024));
    expect(await screen.findByText("Arquivo muito grande. O limite é 20 MB.")).toBeInTheDocument();
    expect(screen.queryByText(/Foto nova/)).toBeNull();
  });

  it("falha no upload mostra o erro do servidor e nao grava o perfil", async () => {
    mockFetch({ "POST /api/uploads": { status: 400, body: { error: "Imagem muito grande em resolução. Reduza a foto e tente de novo." } } });
    await startEditing();
    await userEvent.upload(fileInput(), image());
    await userEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText(/Imagem muito grande em resolução/)).toBeInTheDocument();
    expect(fetchCallsTo("PUT", "/api/profile")).toHaveLength(0);
  });

  it("se o perfil falha depois do upload, tentar de novo reaproveita a foto ja enviada", async () => {
    let attempts = 0;
    mockFetch({
      "POST /api/uploads": { body: { url: "/api/files/fotos/nova.webp" } },
      "PUT /api/profile": () => (++attempts === 1 ? { status: 500, body: { error: "Erro interno do servidor." } } : { body: { ok: true } }),
    });
    await startEditing();
    await userEvent.upload(fileInput(), image());
    await userEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Erro interno do servidor.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Perfil atualizado.");
    expect(fetchCallsTo("POST", "/api/uploads")).toHaveLength(1);
  });
});

describe("ProfileForm: onboarding", () => {
  it("abre ja editando, sem cancelar; ao salvar vai para o destino e atualiza a casca", async () => {
    mockFetch({ "PUT /api/profile": { body: { ok: true } } });
    renderWithProviders(<ProfileForm initial={{ ...EMPTY_PROFILE, name: "Novo" }} mode="onboarding" next="/game-days/g1" />);
    expect(await screen.findByRole("button", { name: "Salvar e entrar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Editar dados" })).toBeNull();
    expect(screen.getByRole("button", { name: "Adicionar foto" })).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("21"), "30");
    await userEvent.type(screen.getByPlaceholderText("178"), "180");
    await userEvent.type(screen.getByPlaceholderText("75"), "80");
    await userEvent.click(screen.getByRole("button", { name: "Salvar e entrar" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/game-days/g1"));
    expect(router.refresh).toHaveBeenCalled();
  });
});

describe("PhotoLightbox", () => {
  it("fecha pelo X, por Esc e pelo fundo, nao pelo conteudo", async () => {
    const onClose = jest.fn();
    render(<PhotoLightbox photoUrl="/foto.webp" name="Gabriel" onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Foto de Gabriel" });
    expect(within(dialog).getByRole("img", { name: "Gabriel" })).toHaveAttribute("src", "/foto.webp");

    fireEvent.mouseDown(screen.getByRole("img"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(dialog);
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));
    // fundo (1) + Esc (1) + X (o mousedown do X cai fora do conteudo e o clique fecha de novo: 2).
    expect(onClose).toHaveBeenCalledTimes(4);
  });
});
