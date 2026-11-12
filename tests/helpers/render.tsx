import { Suspense, type ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { PlayerModalProvider } from "@/components/providers/PlayerModalProvider";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { UserProvider } from "@/components/providers/UserProvider";
import type { CurrentUser } from "@/lib/auth/current-user";
import type { TeamLabelMode } from "@/lib/team-label";

/** Promise ja resolvida, no formato que o `use()` do React 19 le sem suspender. */
export function resolved<T>(value: T): Promise<T> {
  return Object.assign(Promise.resolve(value), { status: "fulfilled" as const, value });
}

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
export const SUPERADMIN: CurrentUser = { ...PLAYER, id: "u-super", username: "super", name: "Super", role: "SUPERADMIN" };

export type ProviderOptions = {
  /** null = visitante. Padrao: jogador logado. */
  user?: CurrentUser | null;
  teamLabelMode?: TeamLabelMode;
};

export function Providers({ user = PLAYER, teamLabelMode = "letters", children }: ProviderOptions & { children: React.ReactNode }) {
  return (
    <UserProvider session={resolved(user)}>
      <PreferencesProvider teamLabelMode={resolved(teamLabelMode)}>
        <ToastProvider>
          <PlayerModalProvider>
            <Suspense fallback={<p>carregando...</p>}>{children}</Suspense>
          </PlayerModalProvider>
        </ToastProvider>
      </PreferencesProvider>
    </UserProvider>
  );
}

/** Renderiza dentro de UserProvider, PreferencesProvider, ToastProvider e PlayerModalProvider. */
export function renderWithProviders(ui: ReactElement, options: ProviderOptions & Omit<RenderOptions, "wrapper"> = {}) {
  const { user, teamLabelMode, ...rest } = options;
  return render(ui, {
    wrapper: ({ children }) => (
      <Providers user={user} teamLabelMode={teamLabelMode}>
        {children}
      </Providers>
    ),
    ...rest,
  });
}
