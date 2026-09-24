"use client";

import { createContext, useContext, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui";
import { Avatar, Stars } from "@/components/Player";
import { type ModalApi, usePlayerModalProvider } from "@/hooks/usePlayerModalProvider";

export type { PlayerDetail } from "@/hooks/usePlayerModalProvider";

const PlayerModalContext = createContext<ModalApi | null>(null);

export function usePlayerModal(): ModalApi {
  const context = useContext(PlayerModalContext);
  if (!context) throw new Error("usePlayerModal precisa do PlayerModalProvider.");
  return context;
}

export function PlayerModalProvider({ children }: { children: ReactNode }) {
  const { userId, player, error, close, api } = usePlayerModalProvider();

  return (
    <PlayerModalContext.Provider value={api}>
      {children}
      {userId ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={close}
        >
          <div
            className="snack-in w-full max-w-md rounded-t-3xl border border-white/10 bg-night-900 p-5 sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">Jogador</h2>
              <Button variant="ghost" size="sm" onClick={close} aria-label="Fechar">
                <X size={18} />
              </Button>
            </div>

            {error ? <p className="py-6 text-center text-sm text-rose-400">{error}</p> : null}
            {!player && !error ? (
              <p className="py-10 text-center text-sm text-slate-500">Carregando...</p>
            ) : null}

            {player ? (
              <div>
                <div className="flex items-center gap-4">
                  <Avatar name={player.name} photoUrl={player.photoUrl} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-slate-100">{player.name}</p>
                    {player.nickname ? (
                      <p className="truncate text-sm text-slate-400">&quot;{player.nickname}&quot;</p>
                    ) : null}
                    <div className="mt-1">
                      <Stars value={player.stars} />
                    </div>
                  </div>
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <Detail label="Posição" value={player.positionLabel} />
                  <Detail label="Pé" value={player.footLabel} />
                  <Detail label="Idade" value={`${player.age} anos`} />
                  <Detail label="Altura" value={`${(player.heightCm / 100).toFixed(2).replace(".", ",")} m`} />
                  <Detail label="Peso" value={`${player.weightKg} kg`} />
                </dl>

                <div className="mt-5 grid grid-cols-4 gap-2 rounded-2xl bg-night-800 p-3 text-center">
                  <Stat label="Gols" value={player.stats.goals} />
                  <Stat label="Assist." value={player.stats.assists} />
                  <Stat label="Jogos" value={player.stats.played} />
                  <Stat label="Vitórias" value={player.stats.won} />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </PlayerModalContext.Provider>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-slate-200">{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-lg font-semibold text-slate-100">{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}
