"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, X } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { ChangePasswordForm } from "@/components/forms/ChangePasswordForm";
import { useToast } from "@/components/providers/ToastProvider";

/** Botao "Alterar senha" que abre o ChangePasswordForm em um modal. */
export function ChangePasswordModal({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();

  const close = useCallback(() => setOpen(false), []);
  const handleSuccess = useCallback(() => {
    setOpen(false);
    toast.show({
      message: "Senha alterada. As sessões abertas em outros aparelhos foram encerradas.",
      tone: "success",
    });
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <KeyRound size={16} />
        Alterar senha
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-password-title"
          className="fixed inset-0 z-50 flex overflow-y-auto bg-black/70 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <Card className="m-auto grid w-full max-w-sm gap-4 border-white/15">
            <div className="flex items-center justify-between gap-2">
              <h2 id="change-password-title" className="text-lg font-semibold">
                Alterar senha
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Fechar"
                className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <ChangePasswordForm username={username} onSuccess={handleSuccess} />
          </Card>
        </div>
      ) : null}
    </>
  );
}
