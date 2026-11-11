"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, Settings, UserRound } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { Avatar } from "@/components/Player";
import { useCurrentUser } from "@/components/providers/UserProvider";
import { ROLE_LABEL } from "@/lib/labels";

const ITEM_CLASS =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/5";

/** Avatar de quem entrou; ao clicar abre o menu da conta (Perfil, Configurações, Sair). */
export function UserAvatar() {
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const displayName = user.name ?? user.username;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Abrir menu da conta"
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pitch-400"
      >
        <Avatar name={displayName} photoUrl={user.photoUrl} size="sm" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-white/10 bg-night-900 p-1.5 shadow-xl shadow-black/40"
        >
          <div className="border-b border-white/10 px-3 pt-2 pb-2.5">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            <p className="text-xs text-slate-500">{ROLE_LABEL[user.role]}</p>
          </div>

          <div className="grid gap-0.5 pt-1.5">
            <Link href="/profile" role="menuitem" onClick={() => setOpen(false)} className={ITEM_CLASS}>
              <UserRound size={18} className="text-slate-400" /> Perfil
            </Link>
            <Link href="/settings" role="menuitem" onClick={() => setOpen(false)} className={ITEM_CLASS}>
              <Settings size={18} className="text-slate-400" /> Configurações
            </Link>
            <form action={logoutAction}>
              <button type="submit" role="menuitem" className={ITEM_CLASS}>
                <LogOut size={18} className="text-slate-400" /> Sair
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
