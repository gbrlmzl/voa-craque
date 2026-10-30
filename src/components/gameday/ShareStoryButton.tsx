"use client";

import { Barlow_Condensed } from "next/font/google";
import { Camera, Download, Flame, Share2 } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { formatDate } from "@/lib/labels";
import type { StoryCardData } from "@/lib/story-card";
import { useStoryShare } from "@/hooks/useStoryShare";
import type { GameDayPlayerStats } from "@/services/gameday-stats";

// Fonte so do story: nome, numeros e rotulos em caixa alta. Sem preload, porque so
// baixa quando o modal abre; se nao chegar em 1,5s o cartao sai com a fonte do sistema.
const storyFont = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "800"],
  display: "swap",
  preload: false,
});

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
    lost: stats.lost,
    winRate: stats.winRate,
    goals: stats.goals,
    assists: stats.assists,
    topScorer: stats.topScorer,
    mvp: stats.mvp,
  };

  const { open, setOpen, rendering, busy, canShare, canvasRef, download, share } = useStoryShare(
    data,
    storyFont.style.fontFamily,
  );

  return (
    <>
      <Button size="lg" className="w-full" onClick={() => setOpen(true)}>
        <Camera size={18} /> Compartilhar meu desempenho
        {stats.topScorer ? <Flame size={16} className="text-amber-300" /> : null}
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Seu story da pelada">
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
      </Modal>
    </>
  );
}
