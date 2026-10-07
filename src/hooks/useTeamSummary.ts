"use client";

import { useEffect, useState } from "react";
import type { TeamSummary } from "@/services/team-summary";

/**
 * Busca o resumo do time ao abrir o modal. `refreshKey` busca de novo quando algo
 * que muda o historico acontece (uma partida terminou); enquanto isso o que ja
 * esta na tela fica, sem piscar de volta para "carregando".
 */
export function useTeamSummary(gameDayId: string, teamId: string, refreshKey: string | null) {
  const [loaded, setLoaded] = useState<{ teamId: string; summary: TeamSummary } | null>(null);
  const [failed, setFailed] = useState<{ teamId: string; message: string } | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/game-days/${gameDayId}/teams/${teamId}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar o time.");
        return body as TeamSummary;
      })
      .then((summary) => {
        if (!active) return;
        setLoaded({ teamId, summary });
        setFailed(null);
      })
      .catch((error: Error) => active && setFailed({ teamId, message: error.message }));
    return () => {
      active = false;
    };
  }, [gameDayId, teamId, refreshKey]);

  // So vale o que foi buscado para este time: trocar de time nao mostra o anterior.
  const summary = loaded?.teamId === teamId ? loaded.summary : null;
  const error = !summary && failed?.teamId === teamId ? failed.message : null;
  return { summary, error, loading: !summary && !error };
}
