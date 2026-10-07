"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCurrentUser } from "@/components/providers/UserProvider";
import {
  dismissKey,
  LIVE_BANNER_DISMISSED_KEY,
  shouldShowLiveNow,
  type LiveNow,
} from "@/lib/live-now";

const POLL_MS = 15_000;

function readDismissed(): string | null {
  try {
    return sessionStorage.getItem(LIVE_BANNER_DISMISSED_KEY);
  } catch {
    return null;
  }
}

/**
 * Busca qual pelada esta ao vivo e decide se o atalho aparece. So organizador
 * busca: para os outros papeis nao ha chamada nenhuma. Suspende ate a sessao
 * chegar, entao quem usa precisa de um <Suspense> por perto.
 */
export function useLiveNowBanner() {
  const user = useCurrentUser();
  const pathname = usePathname();
  const enabled = user?.role === "ADMIN" || user?.role === "SUPERADMIN";

  const [live, setLive] = useState<LiveNow | null>(null);
  // Guardado em sessionStorage (so desta aba); toda leitura e escrita tolera falha.
  const [dismissed, setDismissed] = useState<string | null>(() =>
    typeof window === "undefined" ? null : readDismissed(),
  );

  // Busca ao montar e a cada troca de pagina; enquanto a aba esta visivel, a cada 15s.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function load() {
      try {
        const response = await fetch("/api/game-days/live-now", { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { live: LiveNow | null };
        if (!cancelled) setLive(body.live);
      } catch {
        // Sem rede ou servidor fora: mantem o que ja esta na tela.
      }
    }

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const start = () => {
      stop();
      timer = setInterval(() => void load(), POLL_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void load();
        start();
      } else {
        stop();
      }
    };

    void load();
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, pathname]);

  const current = enabled ? live : null;
  const visible = shouldShowLiveNow(current, pathname, dismissed);

  function dismiss() {
    if (!current) return;
    const key = dismissKey(current);
    setDismissed(key);
    try {
      sessionStorage.setItem(LIVE_BANNER_DISMISSED_KEY, key);
    } catch {
      // Sem armazenamento: o atalho some so ate recarregar a pagina.
    }
  }

  return { live: visible ? current : null, dismiss };
}
