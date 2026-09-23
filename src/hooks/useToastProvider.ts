"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ToastTone = "neutral" | "success" | "error";

export type ToastOptions = {
  message: string;
  tone?: ToastTone;
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
};

export type ToastApi = { show: (options: ToastOptions) => void; dismiss: () => void };

/** Estado do snackbar: uma mensagem por vez, com timer de auto-dispensa. */
export function useToastProvider() {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const dismiss = useCallback(() => {
    clear();
    setToast(null);
  }, [clear]);

  const show = useCallback(
    (options: ToastOptions) => {
      clear();
      const id = Date.now();
      setToast({ ...options, id });
      timer.current = setTimeout(() => setToast(null), options.durationMs ?? 4000);
    },
    [clear],
  );

  useEffect(() => clear, [clear]);

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return { toast, dismiss, api };
}
