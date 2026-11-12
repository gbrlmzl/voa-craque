import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  FloatingInput,
  Input,
  Modal,
  PasswordRequirement,
  SectionTitle,
  Select,
  Textarea,
  cn,
} from "@/components/ui";

describe("Button", () => {
  it("variantes e tamanhos mudam as classes; props nativas passam", async () => {
    const onClick = jest.fn();
    render(
      <>
        <Button onClick={onClick}>Salvar</Button>
        <Button variant="danger" size="lg">Apagar</Button>
        <Button variant="ghost" size="sm" disabled>Quieto</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Salvar" })).toHaveClass("bg-pitch-500", "h-11");
    expect(screen.getByRole("button", { name: "Apagar" })).toHaveClass("bg-rose-600", "h-14");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    const disabled = screen.getByRole("button", { name: "Quieto" });
    expect(disabled).toBeDisabled();
    await userEvent.click(disabled);
  });

  it("className do chamador vence a classe do componente (twMerge)", () => {
    render(<Button className="h-20">X</Button>);
    expect(screen.getByRole("button")).toHaveClass("h-20");
    expect(screen.getByRole("button")).not.toHaveClass("h-11");
  });
});

describe("Badge, Card, EmptyState, SectionTitle", () => {
  it("renderizam o conteudo com o tom pedido", () => {
    render(
      <>
        <Badge tone="good">Pago</Badge>
        <Badge>Neutro</Badge>
        <Card data-testid="card">conteudo</Card>
        <EmptyState title="Nada aqui" description="Volte depois" />
        <EmptyState title="Sem descricao" />
        <SectionTitle hint="3 itens">Inscritos</SectionTitle>
      </>,
    );
    expect(screen.getByText("Pago")).toHaveClass("text-pitch-300");
    expect(screen.getByText("Neutro")).toHaveClass("text-slate-300");
    expect(screen.getByTestId("card")).toHaveTextContent("conteudo");
    expect(screen.getByText("Volte depois")).toBeInTheDocument();
    expect(screen.queryByText(/Sem descricao.+/)).toBeNull();
    expect(screen.getByRole("heading", { name: "Inscritos" })).toBeInTheDocument();
    expect(screen.getByText("3 itens")).toBeInTheDocument();
  });
});

describe("Field", () => {
  it("o rotulo nomeia o campo; o erro substitui a dica", () => {
    const { rerender } = render(
      <Field label="Nome" hint="Como te chamam">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText(/^Nome/)).toBeInTheDocument();
    expect(screen.getByText("Como te chamam")).toBeInTheDocument();
    rerender(
      <Field label="Nome" hint="Como te chamam" error="Informe o nome">
        <Input />
      </Field>,
    );
    expect(screen.queryByText("Como te chamam")).toBeNull();
    expect(screen.getByText("Informe o nome")).toBeInTheDocument();
  });

  it("Input, Textarea e Select aceitam as props nativas", async () => {
    render(
      <>
        <Field label="Linha"><Input defaultValue="a" /></Field>
        <Field label="Texto"><Textarea defaultValue="b" /></Field>
        <Field label="Escolha">
          <Select defaultValue="2">
            <option value="1">Um</option>
            <option value="2">Dois</option>
          </Select>
        </Field>
      </>,
    );
    expect(screen.getByLabelText("Linha")).toHaveValue("a");
    expect(screen.getByLabelText("Texto")).toHaveValue("b");
    await userEvent.selectOptions(screen.getByLabelText("Escolha"), "1");
    expect(screen.getByLabelText("Escolha")).toHaveValue("1");
  });
});

describe("Checkbox", () => {
  it("e um checkbox de verdade: clique no texto marca e o teclado tambem", async () => {
    function Controlled() {
      const [checked, setChecked] = useState(false);
      return <Checkbox label="Manter login" checked={checked} onChange={(e) => setChecked(e.target.checked)} />;
    }
    render(<Controlled />);
    const box = screen.getByRole("checkbox", { name: "Manter login" });
    expect(box).not.toBeChecked();
    await userEvent.click(screen.getByText("Manter login"));
    expect(box).toBeChecked();
    box.focus();
    await userEvent.keyboard(" ");
    expect(box).not.toBeChecked();
  });

  it("desabilitado nao muda", async () => {
    render(<Checkbox label="Fixo" disabled defaultChecked size="sm" />);
    await userEvent.click(screen.getByText("Fixo"));
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});

describe("FloatingInput", () => {
  it("rotulo associado ao campo, erro com aria-invalid e descricao", () => {
    render(<FloatingInput label="E-mail" error="E-mail invalido." />);
    const input = screen.getByLabelText("E-mail");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("E-mail invalido.");
  });

  it("dica aparece quando nao ha erro", () => {
    render(<FloatingInput label="Usuario" hint="Minimo de 3 caracteres" />);
    expect(screen.getByLabelText("Usuario")).toHaveAccessibleDescription("Minimo de 3 caracteres");
  });

  it("campo de senha: botao de olho mostra e oculta", async () => {
    render(<FloatingInput label="Senha" type="password" />);
    const input = screen.getByLabelText("Senha");
    expect(input).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(input).toHaveAttribute("type", "text");
    await userEvent.click(screen.getByRole("button", { name: "Ocultar senha" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("estado do olho pode ser compartilhado por varios campos; showToggle=false esconde o botao", async () => {
    function Pair() {
      const [revealed, setRevealed] = useState(false);
      return (
        <>
          <FloatingInput label="Senha" type="password" revealed={revealed} onRevealedChange={setRevealed} />
          <FloatingInput label="Repita" type="password" revealed={revealed} showToggle={false} />
        </>
      );
    }
    render(<Pair />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(screen.getByLabelText("Repita")).toHaveAttribute("type", "text");
  });

  it("campo desabilitado desabilita o olho tambem", () => {
    render(<FloatingInput label="Senha" type="password" disabled />);
    expect(screen.getByRole("button", { name: "Mostrar senha" })).toBeDisabled();
  });
});

describe("PasswordRequirement", () => {
  it("cumprido ou pendente, tambem para leitor de tela", () => {
    render(
      <ul>
        <PasswordRequirement ok text="8 caracteres" />
        <PasswordRequirement ok={false} text="Uma maiuscula" />
      </ul>,
    );
    expect(screen.getByText("(cumprido)")).toBeInTheDocument();
    expect(screen.getByText("(pendente)")).toBeInTheDocument();
  });
});

describe("Modal", () => {
  it("fecha pelo X, por Esc e pelo clique no fundo, nao pelo clique no conteudo", async () => {
    const onClose = jest.fn();
    render(
      <Modal title="Confirmar" onClose={onClose}>
        <p>Tem certeza?</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog", { name: "Confirmar" });
    expect(dialog).toHaveAttribute("aria-modal", "true");

    await userEvent.click(screen.getByText("Tem certeza?"));
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));
    await userEvent.keyboard("{Escape}");
    await userEvent.pointer({ keys: "[MouseLeft]", target: dialog });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("open=false nao renderiza e nao escuta o teclado", async () => {
    const onClose = jest.fn();
    render(
      <Modal open={false} title="Oculto" onClose={onClose}>
        x
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("cn", () => {
  it("re-exportado pelo indice dos componentes de UI", () => {
    expect(cn("a", false, "b")).toBe("a b");
  });
});
