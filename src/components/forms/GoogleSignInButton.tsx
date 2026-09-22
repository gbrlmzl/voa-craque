"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { googleSignInAction } from "@/actions/auth";

/** Botao escuro das diretrizes de marca do Google, que combina com o tema do app. */
export function GoogleSignInButton({ next }: { next?: string }) {
  return (
    <form action={googleSignInAction}>
      <input type="hidden" name="proximo" value={next ?? "/"} />
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-[#8e918f] bg-[#131314] px-6 text-base font-medium text-[#e3e3e3] transition-colors select-none hover:bg-[#1f1f20] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pitch-400 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? <Loader2 size={18} className="animate-spin" /> : <GoogleLogo />}
      {pending ? "Abrindo o Google..." : "Continuar com o Google"}
    </button>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.61 20.08H42V20H24v8h11.3C33.65 32.66 29.22 36 24 36c-6.63 0-12-5.37-12-12s5.37-12 12-12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.34-.14-2.65-.39-3.92z"
      />
      <path
        fill="#FF3D00"
        d="M6.31 14.69l6.57 4.82C14.66 15.11 18.96 12 24 12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 16.32 4 9.66 8.34 6.31 14.69z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.17 0 9.86-1.98 13.41-5.19l-6.19-5.24C29.21 35.09 26.72 36 24 36c-5.2 0-9.62-3.32-11.28-7.95l-6.52 5.03C9.51 39.56 16.23 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.61 20.08H42V20H24v8h11.3c-.79 2.24-2.23 4.17-4.09 5.57l6.19 5.24C36.97 39.21 44 34 44 24c0-1.34-.14-2.65-.39-3.92z"
      />
    </svg>
  );
}

/** "ou", entre o Google e o formulario de e-mail. */
export function OrDivider({ label = "ou" }: { label?: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-slate-500" role="separator">
      <span className="h-px flex-1 bg-white/10" />
      {label}
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}
