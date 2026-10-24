"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type RatingHistoryEntry = {
  gameDayId: string;
  gameDayTitle: string;
  date: string;
  delta: number;
  mmrAfter: number;
  resultDelta: number;
  attackDelta: number;
  defenseDelta: number;
  normalizeDelta: number;
  stakeFactor: number;
  /** Estrela do perfil que valeu no fator de aposta daquela pelada; nula se nao havia. */
  starsUsed: number | null;
  capped: boolean;
  goals: number;
  assists: number;
  matches: number;
};

/** Ranking geral e as ultimas peladas do jogador: qualquer usuario cadastrado ve. */
export type PlayerRatingDetail = {
  rank: number;
  gameDays: number;
  mmr: number;
  peak: number;
  history: RatingHistoryEntry[];
};

export type PlayerDetail = {
  userId: string;
  name: string;
  nickname: string | null;
  photoUrl: string | null;
  position: string;
  positionLabel: string;
  footLabel: string;
  age: number;
  heightCm: number;
  weightKg: number;
  stars: number | null;
  rating: PlayerRatingDetail | null;
  stats: { goals: number; assists: number; played: number; won: number; winRate: number };
};

export type ModalApi = { open: (userId: string) => void };

/** A ficha do jogador ou o historico dele no ranking, na mesma janela. */
export type PlayerModalView = "profile" | "history";

/** Busca o jogador ao abrir e fecha no Escape. */
export function usePlayerModalProvider() {
  const [userId, setUserId] = useState<string | null>(null);
  const [player, setPlayer] = useState<PlayerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<PlayerModalView>("profile");

  const open = useCallback((id: string) => {
    setUserId(id);
    setPlayer(null);
    setError(null);
    setView("profile");
  }, []);

  const close = useCallback(() => setUserId(null), []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetch(`/api/players/${userId}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar o jogador.");
        return body as PlayerDetail;
      })
      .then((data) => active && setPlayer(data))
      .catch((err: Error) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [userId, close]);

  const api = useMemo<ModalApi>(() => ({ open }), [open]);

  return { userId, player, error, view, setView, close, api };
}
