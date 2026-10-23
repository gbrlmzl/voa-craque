"use client";

import { useCallback, useState } from "react";

/** Qual pelada do extrato esta aberta mostrando a decomposicao. Uma por vez. */
export function usePlayerRatingCard() {
  const [openGameDayId, setOpenGameDayId] = useState<string | null>(null);

  const toggle = useCallback((gameDayId: string) => {
    setOpenGameDayId((current) => (current === gameDayId ? null : gameDayId));
  }, []);

  return { openGameDayId, toggle };
}
