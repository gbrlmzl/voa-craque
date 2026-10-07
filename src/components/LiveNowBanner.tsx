"use client";

import Link from "next/link";
import { ChevronRight, X } from "lucide-react";
import { cn } from "@/components/ui";
import { useTeamName } from "@/components/providers/PreferencesProvider";
import { useLiveNowBanner } from "@/hooks/useLiveNowBanner";
import { MATCH_STATUS_LABEL } from "@/lib/labels";
import { isInterval } from "@/lib/live-now";

/**
 * Cartao flutuante que leva de volta ao painel quando o organizador sai dele com
 * a pelada rolando. Nao renderiza nada para quem nao e organizador.
 */
export function LiveNowBanner() {
  const { live, dismiss } = useLiveNowBanner();
  const teamName = useTeamName();

  if (!live) return null;

  const { match } = live;

  return (
    <>
      {/* O cartao e fixo: este espacador impede que ele cubra o fim da pagina. */}
      <div aria-hidden className="h-24" />

      <div className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-35 mx-auto max-w-md sm:inset-x-auto sm:right-6 sm:bottom-6 sm:mx-0 sm:w-full">
        <div className="snack-in pointer-events-auto relative">
          <Link
            href={`/game-days/${live.gameDayId}/panel`}
            className="flex touch-target items-center gap-3 rounded-2xl border border-pitch-500/40 bg-night-900/95 py-3 pr-4 pl-4 shadow-xl shadow-black/40 backdrop-blur"
          >
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-xs font-semibold text-pitch-300">
                <span className="pulse-live h-2 w-2 shrink-0 rounded-full bg-pitch-400" />
                <span className="truncate pr-6">Ao vivo · {live.title}</span>
              </p>

              {match && !isInterval(live) ? (
                <p className="mt-0.5 text-sm text-slate-100">
                  Partida {match.orderIndex} · {teamName(match.homeName)} {match.homeScore} x {match.awayScore}{" "}
                  {teamName(match.awayName)} ·{" "}
                  <span className={cn(match.status === "PAUSED" && "font-semibold text-amber-300")}>
                    {MATCH_STATUS_LABEL[match.status]}
                  </span>
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-slate-100">
                  {match ? "Intervalo · próxima partida pronta" : "Intervalo"}
                </p>
              )}
            </div>

            <span className="flex shrink-0 flex-col items-center text-center text-[11px] leading-tight font-semibold text-pitch-300">
              <ChevronRight size={20} aria-hidden />
              Voltar ao painel
            </span>
          </Link>

          {/* Fora do <Link>: tocar no X nao deve navegar. A area de toque e maior que o circulo. */}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Esconder atalho da partida ao vivo"
            className="absolute -top-3.5 -right-2 grid h-11 w-11 place-items-center"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full border border-white/15 bg-night-800 text-slate-300">
              <X size={14} aria-hidden />
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
