import "@testing-library/cypress/add-commands";
import "../../src/app/globals.css";
import { mount } from "cypress/react";
import { Suspense, type ReactNode } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { PlayerModalProvider } from "@/components/providers/PlayerModalProvider";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { UserProvider } from "@/components/providers/UserProvider";
import type { CurrentUser } from "@/lib/auth/current-user";
import type { TeamLabelMode } from "@/lib/team-label";

// Sem animacao: a animacao de entrada dos modais (opacity 0 -> 1) deixaria o conteudo
// "invisivel" para o Cypress por alguns quadros, e o Electron sem janela visivel nem
// avanca o quadro. Os valores finais de CSS que os specs medem nao mudam.
const noMotion = document.createElement("style");
noMotion.textContent =
  "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important}";
document.head.appendChild(noMotion);

// O navegador de teste nao deve sair do componente: clicar num <Link> do app so registra o clique.
window.addEventListener(
  "click",
  (event) => {
    if ((event.target as Element | null)?.closest?.("a")) event.preventDefault();
  },
  true,
);

export type MountOptions = {
  /** null = visitante. Padrao: jogador logado. */
  user?: CurrentUser | null;
  teamLabelMode?: TeamLabelMode;
  pathname?: string;
};

export const PLAYER: CurrentUser = {
  id: "u-player",
  email: "jogador@teste.com",
  username: "jogador",
  name: "Jogador Teste",
  role: "USER",
  profileCompleted: true,
  photoUrl: null,
  hasPassword: true,
  googleLinked: false,
};
export const ADMIN: CurrentUser = { ...PLAYER, id: "u-admin", username: "organizador", name: "Organizador", role: "ADMIN" };

function resolved<T>(value: T): Promise<T> {
  return Object.assign(Promise.resolve(value), { status: "fulfilled" as const, value });
}

/** Router falso do App Router: os espioes ficam em cy.get("@push") etc. */
function Shell({ options, children }: { options: MountOptions; children: ReactNode }) {
  const router = {
    push: cy.stub().as("push"),
    replace: cy.stub().as("replace"),
    refresh: cy.stub().as("refresh"),
    back: cy.stub().as("back"),
    forward: cy.stub().as("forward"),
    prefetch: cy.stub().as("prefetch"),
  };
  return (
    <AppRouterContext.Provider value={router as never}>
      <PathnameContext.Provider value={options.pathname ?? "/"}>
        <SearchParamsContext.Provider value={new URLSearchParams() as never}>
          <UserProvider session={resolved(options.user === undefined ? PLAYER : options.user)}>
            <PreferencesProvider teamLabelMode={resolved(options.teamLabelMode ?? "letters")}>
              <ToastProvider>
                <PlayerModalProvider>
                  <Suspense fallback={<p>carregando...</p>}>{children}</Suspense>
                </PlayerModalProvider>
              </ToastProvider>
            </PreferencesProvider>
          </UserProvider>
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>
  );
}

Cypress.Commands.add("mount", (component: ReactNode, options: MountOptions = {}) =>
  mount(<Shell options={options}>{component}</Shell>),
);

/** Esc como o navegador entrega: o evento nasce no <body> e sobe pela captura da janela. */
Cypress.Commands.add("pressEscape", () => cy.get("body").trigger("keydown", { key: "Escape", code: "Escape", bubbles: true }));

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      mount(component: ReactNode, options?: MountOptions): Chainable;
      pressEscape(): Chainable;
    }
  }
}
