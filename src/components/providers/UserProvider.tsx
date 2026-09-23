"use client";

import { createContext, use, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { CurrentUser } from "@/lib/auth/current-user";
import { applyUserPatch, mergeUserPatch, type UserPatch } from "@/lib/auth/user-patch";

type SessionPromise = Promise<CurrentUser | null>;

type UserContextValue = {
  session: SessionPromise;
  patch: UserPatch | null;
  update: (patch: UserPatch) => void;
};

const UserContext = createContext<UserContextValue | null>(null);

/**
 * Guarda a PROMISE da sessao, nao a sessao. O layout raiz dispara a busca e
 * termina de renderizar no mesmo tick; quem precisa do usuario suspende no
 * proprio <Suspense>, e o resto da casca (e o loading.tsx) aparece na hora.
 */
export function UserProvider({ session, children }: { session: SessionPromise; children: ReactNode }) {
  const [local, setLocal] = useState<{ origin: SessionPromise; patch: UserPatch } | null>(null);

  // Promise nova = o servidor rerenderizou o layout raiz (login, logout,
  // router.refresh). O valor dele ja contem o que foi editado aqui, entao o
  // patch local caduca sozinho, sem efeito nem sincronizacao.
  const patch = local && local.origin === session ? local.patch : null;

  const update = useCallback(
    (next: UserPatch) =>
      setLocal((previous) => ({
        origin: session,
        patch: mergeUserPatch(previous && previous.origin === session ? previous.patch : null, next),
      })),
    [session],
  );

  const value = useMemo(() => ({ session, patch, update }), [session, patch, update]);
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

function useUserContext(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) throw new Error("useCurrentUser precisa do UserProvider.");
  return context;
}

/**
 * Suspende ate a sessao chegar: todo componente que chama isto precisa de um
 * <Suspense> por perto, e quanto menor o componente, menos da tela espera.
 * Serve para desenhar; decidir acesso e trabalho do servidor.
 */
export function useCurrentUser(): CurrentUser | null {
  const { session, patch } = useUserContext();
  return applyUserPatch(use(session), patch);
}

/** Aplica uma edicao local (ex.: foto nova) sem ida e volta ao servidor. */
export function useUpdateCurrentUser(): (patch: UserPatch) => void {
  return useUserContext().update;
}
