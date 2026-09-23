"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  skills: { code: string; label: string; polarity: "POSITIVE" | "NEGATIVE" }[];
  stats: { goals: number; assists: number; played: number; won: number; winRate: number };
};

export type ModalApi = { open: (userId: string) => void };

/** Busca o jogador ao abrir e fecha no Escape. */
export function usePlayerModalProvider() {
  const [userId, setUserId] = useState<string | null>(null);
  const [player, setPlayer] = useState<PlayerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback((id: string) => {
    setUserId(id);
    setPlayer(null);
    setError(null);
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

  return { userId, player, error, close, api };
}
