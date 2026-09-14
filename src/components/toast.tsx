"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/components/ui";

export type ToastTone = "neutral" | "success" | "error";

export type ToastOptions = {
  message: string;
  tone?: ToastTone;
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
};

type ToastApi = { show: (options: ToastOptions) => void; dismiss: () => void };

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast precisa do ToastProvider.");
  return context;
}

const TONE_STYLES: Record<ToastTone, string> = {
  neutral: "border-white/15 bg-night-700",
  success: "border-pitch-500/40 bg-pitch-600/90 text-night-950",
  error: "border-rose-500/40 bg-rose-600/90 text-white",
};

/**
 * Snackbar com acao de desfazer. Marcar gol e assistencia nao pede confirmacao:
 * o erro se corrige aqui, em um toque, sem sair da tela.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
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

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-60 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+4.75rem)] sm:pb-6">
          <div
            key={toast.id}
            role="status"
            className={cn(
              "snack-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border px-4 py-3 shadow-xl shadow-black/40",
              TONE_STYLES[toast.tone ?? "neutral"],
            )}
          >
            <span className="flex-1 text-sm font-medium">{toast.message}</span>
            {toast.actionLabel ? (
              <button
                type="button"
                className="touch-target -mr-2 rounded-xl px-3 text-sm font-bold tracking-wide uppercase underline underline-offset-4"
                onClick={() => {
                  const action = toast.onAction;
                  dismiss();
                  void action?.();
                }}
              >
                {toast.actionLabel}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}
