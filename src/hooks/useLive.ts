"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveMatch, LiveSnapshot } from "@/services/live";

const POLL_MS = 3000;

/**
 * Recebe o estado da pelada pelo canal SSE. Se a conexao cair, cai para polling
 * a cada 3s ate o SSE voltar, para a tela nunca ficar congelada.
 */
export function useLive(gameDayId: string, initial: LiveSnapshot) {
  const [snapshot, setSnapshot] = useState<LiveSnapshot>(initial);
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [streaming, setStreaming] = useState(false);

  const apply = useCallback((next: LiveSnapshot) => {
    setSnapshot(next);
    setReceivedAt(Date.now());
  }, []);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/game-days/${gameDayId}/live`, { cache: "no-store" });
    if (response.ok) apply((await response.json()) as LiveSnapshot);
  }, [gameDayId, apply]);

  useEffect(() => {
    const source = new EventSource(`/api/game-days/${gameDayId}/stream`);

    source.addEventListener("snapshot", (event) => {
      try {
        apply(JSON.parse((event as MessageEvent<string>).data) as LiveSnapshot);
        setStreaming(true);
      } catch {
        setStreaming(false);
      }
    });

    source.addEventListener("open", () => setStreaming(true));
    source.addEventListener("error", () => setStreaming(false));

    return () => source.close();
  }, [gameDayId, apply]);

  useEffect(() => {
    if (streaming) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [streaming, refresh]);

  return { snapshot, receivedAt, streaming, refresh, apply };
}

/** Cronometro local: conta a partir do ultimo tempo recebido do servidor. */
export function useCountdown(match: LiveMatch | null, receivedAt: number): number {
  const [tick, setTick] = useState(0);
  const frame = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (match?.status !== "RUNNING") {
      if (frame.current) clearInterval(frame.current);
      frame.current = null;
      return;
    }
    frame.current = setInterval(() => setTick((value) => value + 1), 250);
    return () => {
      if (frame.current) clearInterval(frame.current);
      frame.current = null;
    };
  }, [match?.status, match?.id]);

  if (!match) return 0;
  if (match.status !== "RUNNING") return match.remainingMs;
  void tick;
  return Math.max(0, match.remainingMs - (Date.now() - receivedAt));
}
