"use client";

import { useEffect, useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/Card";

/**
 * Modal padrao: folha que sobe do rodape no celular e centraliza no desktop.
 * Fecha pelo X, com Esc e com clique no fundo; o titulo nomeia o dialogo.
 */
export function Modal({
  open = true,
  onClose,
  title,
  children,
  className,
}: {
  open?: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex overflow-y-auto bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <Card
        className={cn(
          "snack-in mx-auto mt-auto grid w-full max-w-sm gap-4 border-white/15 bg-night-900 sm:my-auto",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id={titleId} className="min-w-0 pt-1.5 text-lg leading-tight font-semibold break-words">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </Card>
    </div>
  );
}
