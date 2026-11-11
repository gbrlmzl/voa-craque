import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { loginAction, registerAction } from "@/actions/auth";
import { changePasswordAction, forgotPasswordAction, resetPasswordAction } from "@/actions/password";
import { setTeamLabelModeAction } from "@/actions/preferences";
import { ChangePasswordForm } from "@/components/forms/ChangePasswordForm";
import { ChangePasswordModal } from "@/components/forms/ChangePasswordModal";
import { ForgotPasswordForm } from "@/components/forms/ForgotPasswordForm";
import { GoogleSignInButton, OrDivider } from "@/components/forms/GoogleSignInButton";
import { LoginForm } from "@/components/forms/LoginForm";
import { PreferencesForm } from "@/components/forms/PreferencesForm";
import { RegisterForm } from "@/components/forms/RegisterForm";
import { ResetPasswordForm } from "@/components/forms/ResetPasswordForm";
import { DiscardChangesModal } from "@/components/forms/DiscardChangesModal";
import { renderWithProviders } from "../../helpers/render";

jest.mock("@/actions/auth", () => ({
  loginAction: jest.fn(),
  registerAction: jest.fn(),
  googleSignInAction: jest.fn(),
  logoutAction: jest.fn(),
}));
jest.mock("@/actions/password", () => ({
  changePasswordAction: jest.fn(),
  forgotPasswordAction: jest.fn(),
  resetPasswordAction: jest.fn(),
}));
jest.mock("@/actions/preferences", () => ({ setTeamLabelModeAction: jest.fn() }));

const mocked = (fn: unknown) => fn as jest.Mock;

beforeEach(() => {
  for (const fn of [loginAction, registerAction, changePasswordAction, forgotPasswordAction, resetPasswordAction, setTeamLabelModeAction]) {
    mocked(fn).mockReset();
    mocked(fn).mockResolvedValue({});
  }
});

describe("LoginForm", () => {
  it("o botao so habilita com usuario e senha preenchidos", async () => {
    render(<LoginForm googleEnabled={false} />);
    const submit = screen.getByRole("button", { name: "Entrar" });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Usuário"), "gabriel");
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Senha"), "segredo");
    expect(submit).toBeEnabled();
  });

  it("envia usuario, senha, 'manter login' e o proximo no campo oculto", async () => {
    render(<LoginForm next="/game-days/g1" googleEnabled={false} />);
    await userEvent.type(screen.getByLabelText("Usuário"), "gabriel");
    await userEvent.type(screen.getByLabelText("Senha"), "segredo");
    await userEvent.click(screen.getByRole("checkbox", { name: "Manter login" }));
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(loginAction).toHaveBeenCalledTimes(1));
    const form = mocked(loginAction).mock.calls[0][1] as FormData;
    expect(form.get("username")).toBe("gabriel");
    expect(form.get("password")).toBe("segredo");
    expect(form.get("keepLoggedIn")).toBe("on");
    expect(form.get("proximo")).toBe("/game-days/g1");
  });

  it("sem next o proximo e /", async () => {
    render(<LoginForm googleEnabled={false} />);
    await userEvent.type(screen.getByLabelText("Usuário"), "a");
    await userEvent.type(screen.getByLabelText("Senha"), "b");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(loginAction).toHaveBeenCalled());
    expect((mocked(loginAction).mock.calls[0][1] as FormData).get("proximo")).toBe("/");
  });

  it("mostra o aviso inicial (senha redefinida) e a mensagem geral do servidor; limpa a senha", async () => {
    mocked(loginAction).mockResolvedValue({ message: "Usuário ou senha não conferem." });
    render(<LoginForm notice="Senha redefinida. Entre com a nova." googleEnabled={false} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Senha redefinida. Entre com a nova.");

    await userEvent.type(screen.getByLabelText("Usuário"), "gabriel");
    await userEvent.type(screen.getByLabelText("Senha"), "errada");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Usuário ou senha não conferem.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Senha")).toHaveValue(""));
    expect(screen.getByLabelText("Usuário")).toHaveValue("gabriel");
  });

  it("erros por campo vindos do servidor", async () => {
    mocked(loginAction).mockResolvedValue({ fieldErrors: { username: "Informe o usuário." } });
    render(<LoginForm googleEnabled={false} />);
    await userEvent.type(screen.getByLabelText("Usuário"), " ");
    await userEvent.type(screen.getByLabelText("Senha"), "x");
    // espaco nao conta como preenchido: forca o envio pelo teclado
    await userEvent.type(screen.getByLabelText("Usuário"), "a");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Informe o usuário.")).toBeInTheDocument();
    expect(screen.getByLabelText("Usuário")).toHaveAttribute("aria-invalid", "true");
  });

  it("enquanto envia: botao 'Entrando...' e campos desabilitados", async () => {
    let finish!: (value: object) => void;
    mocked(loginAction).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<LoginForm googleEnabled={false} />);
    await userEvent.type(screen.getByLabelText("Usuário"), "a");
    await userEvent.type(screen.getByLabelText("Senha"), "b");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("button", { name: "Entrando..." })).toBeDisabled();
    expect(screen.getByLabelText("Usuário")).toBeDisabled();
    await act(async () => finish({}));
  });

  it("link para recuperar a senha; nota do Google so quando habilitado", () => {
    const { rerender } = render(<LoginForm googleEnabled={false} />);
    expect(screen.getByRole("link", { name: "Esqueci minha senha" })).toHaveAttribute("href", "/forgot-password");
    expect(screen.queryByText(/entra só pelo botão do Google/)).toBeNull();
    rerender(<LoginForm googleEnabled />);
    expect(screen.getByText(/entra só pelo botão do Google/)).toBeInTheDocument();
  });
});

describe("RegisterForm", () => {
  async function fill({ password = "Senha@123", confirm = password } = {}) {
    await userEvent.type(screen.getByLabelText("Nome de usuário"), "novo.jogador");
    await userEvent.type(screen.getByLabelText("E-mail"), "novo@teste.com");
    await userEvent.type(screen.getByLabelText("Senha"), password);
    await userEvent.type(screen.getByLabelText("Repita a senha"), confirm);
  }
  const requirement = (text: string) => screen.getByText(text).closest("li")!;

  it("os requisitos da senha acendem conforme ela e digitada", async () => {
    render(<RegisterForm />);
    for (const text of ["Ao menos 8 caracteres", "Deve conter um número ou símbolo", "Deve conter ao menos uma letra maiúscula", "As senhas devem coincidir"]) {
      expect(requirement(text)).toHaveTextContent("(pendente)");
    }
    await userEvent.type(screen.getByLabelText("Senha"), "abcdefgh");
    expect(requirement("Ao menos 8 caracteres")).toHaveTextContent("(cumprido)");
    expect(requirement("Deve conter ao menos uma letra maiúscula")).toHaveTextContent("(pendente)");
    await userEvent.type(screen.getByLabelText("Senha"), "A1");
    expect(requirement("Deve conter ao menos uma letra maiúscula")).toHaveTextContent("(cumprido)");
    expect(requirement("Deve conter um número ou símbolo")).toHaveTextContent("(cumprido)");
    expect(requirement("As senhas devem coincidir")).toHaveTextContent("(pendente)");
    await userEvent.type(screen.getByLabelText("Repita a senha"), "abcdefghA1");
    expect(requirement("As senhas devem coincidir")).toHaveTextContent("(cumprido)");
  });

  it("so habilita 'Criar conta' com tudo valido", async () => {
    render(<RegisterForm />);
    expect(screen.getByRole("button", { name: "Criar conta" })).toBeDisabled();
    await fill({ password: "Senha@123", confirm: "Outra@123" });
    expect(screen.getByRole("button", { name: "Criar conta" })).toBeDisabled();
    await userEvent.clear(screen.getByLabelText("Repita a senha"));
    await userEvent.type(screen.getByLabelText("Repita a senha"), "Senha@123");
    expect(screen.getByRole("button", { name: "Criar conta" })).toBeEnabled();
  });

  it("o olho da senha mostra tambem a confirmacao", async () => {
    render(<RegisterForm />);
    await userEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(screen.getByLabelText("Repita a senha")).toHaveAttribute("type", "text");
  });

  it("envia os campos e o proximo; mostra erros por campo e a mensagem geral", async () => {
    mocked(registerAction).mockResolvedValue({
      fieldErrors: { email: "Já existe uma conta com este e-mail." },
      message: "Muitos cadastros a partir desta rede.",
    });
    render(<RegisterForm next="/game-days/g1" />);
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByText("Já existe uma conta com este e-mail.")).toBeInTheDocument();
    expect(screen.getByText("Muitos cadastros a partir desta rede.")).toBeInTheDocument();
    const form = mocked(registerAction).mock.calls[0][1] as FormData;
    expect(Object.fromEntries(form)).toMatchObject({
      username: "novo.jogador",
      email: "novo@teste.com",
      password: "Senha@123",
      passwordConfirm: "Senha@123",
      proximo: "/game-days/g1",
    });
  });
});

describe("ForgotPasswordForm", () => {
  it("envia o e-mail e troca o formulario pela mensagem neutra", async () => {
    mocked(forgotPasswordAction).mockResolvedValue({ ok: true, message: "Se existir uma conta, enviamos um link." });
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/E-mail/), "a@b.com");
    await userEvent.click(screen.getByRole("button", { name: "Enviar link" }));
    expect(await screen.findByText("Se existir uma conta, enviamos um link.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar link" })).toBeNull();
    expect((mocked(forgotPasswordAction).mock.calls[0][1] as FormData).get("email")).toBe("a@b.com");
  });

  it("erro de campo e limite de tentativas aparecem no formulario", async () => {
    mocked(forgotPasswordAction).mockResolvedValue({ fieldErrors: { email: "E-mail invalido." }, message: "Muitas tentativas." });
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/E-mail/), "x@y.z");
    await userEvent.click(screen.getByRole("button", { name: "Enviar link" }));
    expect(await screen.findByText("E-mail invalido.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Muitas tentativas.");
  });
});

describe("ResetPasswordForm", () => {
  it("leva o token no campo oculto e mostra o erro do link", async () => {
    mocked(resetPasswordAction).mockResolvedValue({ message: "Este link é inválido ou expirou. Peça um novo." });
    const { container } = render(<ResetPasswordForm token="tok-123" />);
    expect(container.querySelector('input[name="token"]')).toHaveValue("tok-123");
    await userEvent.type(screen.getByLabelText(/^Senha nova/), "Nova@Senha1");
    await userEvent.type(screen.getByLabelText(/^Repita a senha nova/), "Nova@Senha1");
    await userEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Este link é inválido ou expirou");
    expect((mocked(resetPasswordAction).mock.calls[0][1] as FormData).get("token")).toBe("tok-123");
  });

  it("erros por campo", async () => {
    mocked(resetPasswordAction).mockResolvedValue({ fieldErrors: { password: "Fraca.", passwordConfirm: "Nao confere." } });
    render(<ResetPasswordForm token="t" />);
    await userEvent.type(screen.getByLabelText(/^Senha nova/), "x");
    await userEvent.type(screen.getByLabelText(/^Repita a senha nova/), "y");
    await userEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    expect(await screen.findByText("Fraca.")).toBeInTheDocument();
    expect(screen.getByText("Nao confere.")).toBeInTheDocument();
  });
});

describe("ChangePasswordForm e modal", () => {
  async function fill() {
    await userEvent.type(screen.getByLabelText(/^Senha atual/), "Atual@123");
    await userEvent.type(screen.getByLabelText(/^Senha nova/), "Nova@Senha1");
    await userEvent.type(screen.getByLabelText(/^Repita a senha nova/), "Nova@Senha1");
  }

  it("campo de usuario oculto para o gerenciador de senhas; erro na senha atual", async () => {
    mocked(changePasswordAction).mockResolvedValue({ fieldErrors: { currentPassword: "Senha atual incorreta." } });
    const { container } = render(<ChangePasswordForm username="gabriel" />);
    expect(container.querySelector('input[name="username"]')).toHaveValue("gabriel");
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Alterar senha" }));
    expect(await screen.findByText("Senha atual incorreta.")).toBeInTheDocument();
  });

  it("sucesso: mensagem, formulario limpo e onSuccess chamado", async () => {
    mocked(changePasswordAction).mockResolvedValue({ ok: true, message: "Senha alterada." });
    const onSuccess = jest.fn();
    render(<ChangePasswordForm username="gabriel" onSuccess={onSuccess} />);
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Alterar senha" }));
    expect(await screen.findByText("Senha alterada.")).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalled();
    expect(screen.getByLabelText(/^Senha atual/)).toHaveValue("");
  });

  it("mensagem geral de erro (conta do Google) aparece como alerta", async () => {
    mocked(changePasswordAction).mockResolvedValue({ message: "Esta conta entra pelo Google e não tem senha local." });
    render(<ChangePasswordForm username="g" />);
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Alterar senha" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("entra pelo Google");
  });

  it("modal: abre, fecha pelo X, por Esc e pelo fundo; sucesso fecha e avisa com toast", async () => {
    mocked(changePasswordAction).mockResolvedValue({ ok: true, message: "ok" });
    renderWithProviders(<ChangePasswordModal username="gabriel" />);
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Alterar senha" }));
    expect(screen.getByRole("dialog", { name: "Alterar senha" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Alterar senha" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Alterar senha" }));
    await userEvent.pointer({ keys: "[MouseLeft]", target: screen.getByRole("dialog") });
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Alterar senha" }));
    await fill();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Alterar senha" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Senha alterada. As sessões abertas em outros aparelhos foram encerradas.");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("GoogleSignInButton", () => {
  it("botao do Google com o proximo no formulario; separador 'ou'", () => {
    const { container } = render(
      <>
        <GoogleSignInButton next="/ranking" />
        <OrDivider />
        <OrDivider label="ou entre com e-mail" />
      </>,
    );
    expect(screen.getByRole("button", { name: "Continuar com o Google" })).toBeInTheDocument();
    expect(container.querySelector('input[name="proximo"]')).toHaveValue("/ranking");
    expect(screen.getAllByRole("separator")).toHaveLength(2);
    expect(screen.getByText("ou entre com e-mail")).toBeInTheDocument();
  });

  it("sem next o proximo e /", () => {
    const { container } = render(<GoogleSignInButton />);
    expect(container.querySelector('input[name="proximo"]')).toHaveValue("/");
  });
});

describe("PreferencesForm", () => {
  it("mostra a previa no modo atual e troca otimista, com toast de sucesso", async () => {
    mocked(setTeamLabelModeAction).mockResolvedValue({ ok: true });
    renderWithProviders(<PreferencesForm />);
    expect(await screen.findByText("Assim: Time A, Time B, Time C")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Letras (Time A)" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "Números (Time 1)" }));
    expect(await screen.findByText("Assim: Time 1, Time 2, Time 3")).toBeInTheDocument();
    expect(setTeamLabelModeAction).toHaveBeenCalledWith("numbers");
    expect(await screen.findByRole("status")).toHaveTextContent("Preferência salva.");
  });

  it("clicar no modo ja ativo nao chama o servidor", async () => {
    renderWithProviders(<PreferencesForm />);
    await userEvent.click(await screen.findByRole("button", { name: "Letras (Time A)" }));
    expect(setTeamLabelModeAction).not.toHaveBeenCalled();
  });

  it("se o servidor recusar, volta ao modo anterior e avisa o erro", async () => {
    mocked(setTeamLabelModeAction).mockResolvedValue({ ok: false });
    renderWithProviders(<PreferencesForm />, { teamLabelMode: "numbers" });
    expect(await screen.findByText("Assim: Time 1, Time 2, Time 3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Letras (Time A)" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Não foi possível salvar a preferência.");
    expect(screen.getByText("Assim: Time 1, Time 2, Time 3")).toBeInTheDocument();
  });

  it("se a chamada lancar, tambem volta e avisa", async () => {
    mocked(setTeamLabelModeAction).mockRejectedValue(new Error("rede"));
    renderWithProviders(<PreferencesForm />);
    await userEvent.click(await screen.findByRole("button", { name: "Números (Time 1)" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Não foi possível salvar");
    expect(screen.getByText("Assim: Time A, Time B, Time C")).toBeInTheDocument();
  });
});

describe("DiscardChangesModal", () => {
  it("fechado nao renderiza; aberto oferece descartar ou continuar editando", async () => {
    const onDiscard = jest.fn();
    const onKeep = jest.fn();
    const { rerender } = render(<DiscardChangesModal open={false} onDiscard={onDiscard} onKeepEditing={onKeep} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<DiscardChangesModal open onDiscard={onDiscard} onKeepEditing={onKeep} />);
    expect(screen.getByRole("dialog", { name: "Descartar alterações?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Descartar" }));
    await userEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
    await userEvent.keyboard("{Escape}");
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onKeep).toHaveBeenCalledTimes(2);
  });
});
