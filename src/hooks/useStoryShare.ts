"use client";

import { useEffect, useRef, useState } from "react";
import { canvasToBlob, drawStoryCard, type StoryCardData } from "@/lib/story-card";
import { useToast } from "@/components/providers/ToastProvider";

export function useStoryShare(data: StoryCardData) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const probe = new File([], "probe.png", { type: "image/png" });
    setCanShare(typeof navigator.share === "function" && navigator.canShare?.({ files: [probe] }) === true);
  }, []);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    let cancelled = false;
    setRendering(true);
    drawStoryCard(canvasRef.current, data).finally(() => {
      if (!cancelled) setRendering(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function getBlob(): Promise<Blob | null> {
    if (!canvasRef.current) return null;
    return canvasToBlob(canvasRef.current);
  }

  const fileName = `voacraque-${data.name.toLowerCase().replace(/\s+/g, "-")}.png`;

  async function download() {
    setBusy(true);
    try {
      const blob = await getBlob();
      if (!blob) throw new Error("Não foi possível gerar a imagem.");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      toast.show({ message: (error as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    setBusy(true);
    try {
      const blob = await getBlob();
      if (!blob) throw new Error("Não foi possível gerar a imagem.");
      const file = new File([blob], fileName, { type: "image/png" });
      await navigator.share({
        files: [file],
        title: "Meu desempenho na pelada",
        text: `Joguei a ${data.gameDayTitle} e mandei essa performance! ⚽`,
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast.show({ message: "Não foi possível compartilhar. Baixe a imagem e envie pelo Instagram.", tone: "error" });
      }
    } finally {
      setBusy(false);
    }
  }

  return { open, setOpen, rendering, busy, canShare, canvasRef, download, share };
}
