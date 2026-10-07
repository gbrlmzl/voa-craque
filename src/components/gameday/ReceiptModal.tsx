"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Maximize2, X } from "lucide-react";
import { Button, cn, Modal } from "@/components/ui";

/**
 * Comprovante em tela cheia, por cima do modal. Vai para o body num portal: o
 * modal anima com transform, e um `fixed` dentro dele ficaria preso ao cartao.
 */
function FullscreenReceipt({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  useEffect(() => {
    // Captura na janela para o Esc fechar so a tela cheia: o Modal tambem escuta
    // o Esc e, sem isso, fecharia o comprovante inteiro junto.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} em tela cheia`}
      className="fixed inset-0 z-[60] grid place-items-center bg-black/95 p-2"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {/* dvh e nao `max-h-full`: a trilha do grid tem a altura da propria imagem, entao a porcentagem nao limita nada. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={title} className="max-h-[calc(100dvh-1rem)] max-w-full object-contain" />
      <button
        type="button"
        autoFocus
        onClick={onClose}
        aria-label="Fechar tela cheia"
        className="absolute top-3 right-3 grid h-10 w-10 place-items-center rounded-full bg-black/60 text-slate-100 backdrop-blur transition-colors hover:bg-black/80"
      >
        <X size={20} />
      </button>
    </div>,
    document.body,
  );
}

/**
 * Mostra o comprovante dentro do app. Com `decision`, o organizador decide ali
 * mesmo: recusar na esquerda, aprovar na direita. Sem ela e so visualizacao.
 */
export function ReceiptModal({
  url,
  title,
  decision,
  onClose,
}: {
  url: string;
  title: string;
  decision?: { busy: boolean; onReject: () => void; onApprove: () => void };
  onClose: () => void;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [fullscreen, setFullscreen] = useState(false);

  return (
    // `my-auto` centraliza no celular, onde o Modal padrao encosta no rodape.
    <Modal title={title} onClose={onClose} className="my-auto max-w-md">
      <div className="relative grid min-h-48 place-items-center overflow-hidden rounded-xl bg-night-950">
        {status === "loading" ? (
          <Loader2 size={24} className="animate-spin text-slate-400" aria-label="Carregando comprovante" />
        ) : null}
        {status === "error" ? (
          <p className="px-4 text-center text-sm text-rose-300">Não foi possível carregar o comprovante.</p>
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={title}
          onLoad={() => setStatus("ready")}
          onError={() => setStatus("error")}
          className={cn("max-h-[65dvh] w-full object-contain", status !== "ready" && "hidden")}
        />
        {status === "ready" ? (
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            aria-label="Ver comprovante em tela cheia"
            title="Tela cheia"
            className="absolute right-2 bottom-2 grid h-9 w-9 place-items-center rounded-lg bg-black/60 text-slate-100 backdrop-blur transition-colors hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pitch-400"
          >
            <Maximize2 size={18} />
          </button>
        ) : null}
      </div>

      {decision ? (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="danger" size="lg" onClick={decision.onReject} disabled={decision.busy}>
            <X size={18} /> Recusar
          </Button>
          <Button size="lg" onClick={decision.onApprove} disabled={decision.busy}>
            <Check size={18} /> {decision.busy ? "Aprovando..." : "Aprovar"}
          </Button>
        </div>
      ) : null}

      {fullscreen ? <FullscreenReceipt url={url} title={title} onClose={() => setFullscreen(false)} /> : null}
    </Modal>
  );
}
