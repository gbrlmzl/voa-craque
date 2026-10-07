import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { DEFAULT_TEAM_LABEL_MODE, parseTeamLabelMode, TEAM_LABEL_COOKIE, type TeamLabelMode } from "@/lib/team-label";

/**
 * A preferencia como promise, para o layout raiz entregar ao PreferencesProvider
 * sem `await` (mesmo motivo de getSessionPromise: um layout que espera dado de
 * runtime bloqueia a navegacao e esconde o loading.tsx). Qualquer falha vira o
 * padrao; `unstable_rethrow` devolve ao Next os erros de controle de fluxo dele.
 */
export function getTeamLabelModePromise(): Promise<TeamLabelMode> {
  return cookies()
    .then((store) => parseTeamLabelMode(store.get(TEAM_LABEL_COOKIE)?.value))
    .catch((error: unknown) => {
      unstable_rethrow(error);
      return DEFAULT_TEAM_LABEL_MODE;
    });
}
