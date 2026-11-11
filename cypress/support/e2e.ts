import "@testing-library/cypress/add-commands";

// Sem animacao no E2E: modais e toasts entram com opacity 0 -> 1 e a asserção de
// visibilidade ficaria esperando quadros. Os valores finais de CSS nao mudam.
Cypress.on("window:before:load", (win) => {
  // O Next revela as secoes em streaming (Suspense) por um script que so continua dentro de
  // requestAnimationFrame. Navegador sem janela pintando (Electron em segundo plano, janela
  // coberta) nao dispara o quadro e a pagina fica para sempre "invisivel" para o teste. Este
  // atalho dispara o callback por timer; em Chrome visivel o comportamento e o mesmo.
  win.requestAnimationFrame = (callback: FrameRequestCallback) =>
    win.setTimeout(() => callback(win.performance.now()), 16) as unknown as number;
  win.cancelAnimationFrame = (handle: number) => win.clearTimeout(handle);

  const apply = () => {
    const style = win.document.createElement("style");
    style.textContent =
      "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important}";
    win.document.head.appendChild(style);
  };
  if (win.document.head) apply();
  else win.document.addEventListener("DOMContentLoaded", apply);
});

type Cookie = { name: string; value: string; options: { httpOnly?: boolean; sameSite?: string; path?: string; secure?: boolean; maxAge?: number } };

let rodada = 0;

/** Zera o banco do E2E e semeia o cenario (cypress/tasks/cenarios.ts). */
Cypress.Commands.add("cenario", (nome: string) => {
  rodada += 1;
  return cy.task("db:cenario", nome, { timeout: 120_000 }) as unknown as Cypress.Chainable<{ cenario: string; gameDayId: string | null }>;
});

/** Entra como `username` sem passar pelo formulario: cookies emitidos pelas funcoes reais de src/lib/auth. */
Cypress.Commands.add("entrarComo", (username: string) => {
  cy.session(
    [username, rodada],
    () => {
      cy.task("sessao", username, { timeout: 60_000 }).then((cookies) => {
        for (const { name, value, options } of cookies as Cookie[]) {
          cy.setCookie(name, value, {
            httpOnly: options.httpOnly,
            sameSite: "lax",
            path: options.path ?? "/",
            secure: options.secure ?? false,
          });
        }
      });
    },
    {
      validate() {
        // 401 = sessao invalida. Em manutencao a API responde 403 para quem tem sessao valida.
        cy.request({ url: "/api/game-days", failOnStatusCode: false }).its("status").should("not.eq", 401);
      },
    },
  );
});

/** Sai pelo menu da conta (o mesmo caminho do usuario). */
Cypress.Commands.add("sair", () => {
  cy.findByRole("button", { name: "Abrir menu" }).click();
  cy.findByRole("button", { name: "Sair" }).click();
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      cenario(nome: string): Chainable<{ cenario: string; gameDayId: string | null }>;
      entrarComo(username: string): Chainable<void>;
      sair(): Chainable<void>;
    }
  }
}

export {};
