"use client";

import { Camera, Download, Flame, Share2, X } from "lucide-react";
import { Button } from "@/components/ui";
import { formatDate } from "@/lib/labels";
import type { StoryCardData } from "@/lib/story-card";
import { useStoryShare } from "@/hooks/useStoryShare";
import type { GameDayPlayerStats } from "@/services/gameday-stats";

type ShareStoryButtonProps = {
  gameDay: { title: string; scheduledAt: string; location: string };
  stats: GameDayPlayerStats;
};

export function ShareStoryButton({ gameDay, stats }: ShareStoryButtonProps) {
  const data: StoryCardData = {
    gameDayTitle: gameDay.title,
    gameDayDate: formatDate(gameDay.scheduledAt),
    location: gameDay.location,
    name: stats.name,
    nickname: stats.nickname,
    photoUrl: stats.photoUrl,
    played: stats.played,
    won: stats.won,
    winRate: stats.winRate,
    goals: stats.goals,
    assists: stats.assists,
    topScorer: stats.topScorer,
  };

  const { open, setOpen, rendering, busy, canShare, canvasRef, download, share } = useStoryShare(data);

  return (
    <>
      <Button size="lg" className="w-full" onClick={() => setOpen(true)}>
        <Camera size={18} /> Compartilhar meu desempenho
        {stats.topScorer ? <Flame size={16} className="text-amber-300" /> : null}
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <div
            className="snack-in grid w-full max-w-sm gap-4 rounded-t-3xl border border-white/10 bg-night-900 p-5 sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
                Seu story da pelada
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Fechar">
                <X size={18} />
              </Button>
            </div>

            <div className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-3xl border border-white/10 shadow-xl shadow-black/40">
              <canvas ref={canvasRef} className="block h-auto w-full" />
              {rendering ? (
                <div className="absolute inset-0 flex items-center justify-center bg-night-950/80 text-sm text-slate-400">
                  Gerando...
                </div>
              ) : null}
            </div>

            {canShare ? (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" size="lg" onClick={download} disabled={rendering || busy}>
                  <Download size={18} /> Baixar
                </Button>
                <Button size="lg" onClick={share} disabled={rendering || busy}>
                  <Share2 size={18} /> Compartilhar
                </Button>
              </div>
            ) : (
              <Button size="lg" className="w-full" onClick={download} disabled={rendering || busy}>
                <Download size={18} /> Baixar imagem
              </Button>
            )}
            <p className="text-center text-xs text-slate-500">
              Baixe a imagem e adicione como story no Instagram.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
