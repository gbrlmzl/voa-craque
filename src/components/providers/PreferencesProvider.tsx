"use client";

import { createContext, use, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { formatTeamName, formatTeamTag, type TeamLabelMode } from "@/lib/team-label";

type ModePromise = Promise<TeamLabelMode>;

type PreferencesContextValue = {
  teamLabelMode: ModePromise;
  /** Escolha local ainda nao confirmada pelo servidor; null quando nao ha. */
  override: TeamLabelMode | null;
  setTeamLabelMode: (mode: TeamLabelMode) => void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

/**
 * Espelha o UserProvider: guarda a PROMISE da preferencia (o layout raiz nao
 * espera por ela) e aceita uma escolha local otimista, para a tela trocar no
 * toque. Promise nova = o servidor rerenderizou o layout depois de gravar o
 * cookie, entao a escolha local caduca sozinha, sem efeito.
 */
export function PreferencesProvider({
  teamLabelMode,
  children,
}: {
  teamLabelMode: ModePromise;
  children: ReactNode;
}) {
  const [local, setLocal] = useState<{ origin: ModePromise; mode: TeamLabelMode } | null>(null);
  const override = local && local.origin === teamLabelMode ? local.mode : null;

  const setTeamLabelMode = useCallback(
    (mode: TeamLabelMode) => setLocal({ origin: teamLabelMode, mode }),
    [teamLabelMode],
  );

  const value = useMemo(
    () => ({ teamLabelMode, override, setTeamLabelMode }),
    [teamLabelMode, override, setTeamLabelMode],
  );
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

function usePreferencesContext(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("As preferencias precisam do PreferencesProvider.");
  return context;
}

/**
 * Suspende ate o cookie ser lido (quase instantaneo): quem chama precisa de um
 * <Suspense> por perto, e toda pagina ja tem o do loading.tsx.
 */
export function useTeamLabelMode(): TeamLabelMode {
  const { teamLabelMode, override } = usePreferencesContext();
  // `use` pode ser condicional: com escolha local nao ha o que esperar.
  return override ?? use(teamLabelMode);
}

/** "A" -> "Time A" ou "Time 1", para texto em template string e aria-label. */
export function useTeamName(): (name: string) => string {
  const mode = useTeamLabelMode();
  return useCallback((name: string) => formatTeamName(name, mode), [mode]);
}

/** "A" -> "A" ou "1": o nome curto, sem o prefixo "Time". */
export function useTeamTag(): (name: string) => string {
  const mode = useTeamLabelMode();
  return useCallback((name: string) => formatTeamTag(name, mode), [mode]);
}

export function useSetTeamLabelMode(): (mode: TeamLabelMode) => void {
  return usePreferencesContext().setTeamLabelMode;
}
