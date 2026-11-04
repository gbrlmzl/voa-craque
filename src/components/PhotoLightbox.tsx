"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Foto ampliada em tela cheia. Nao usa o Modal: ele e um cartao com titulo, e
 * aqui a foto e o conteudo inteiro. A foto gravada tem 512px (PHOTO_SIZE em
 * profile-photo.ts); maior que isso so borra.
 */
export function PhotoLightbox({
  photoUrl,
  name,
  onClose,
}: {
  photoUrl: string;
  name: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Foto de ${name}`}
      className="fade-in fixed inset-0 z-50 grid place-items-center bg-black/85 p-4"
      onMouseDown={(event) => {
        // Toque fora da foto fecha; na foto e no nome nao.
        if (!(event.target as Element).closest("[data-lightbox-content]")) onClose();
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        className="absolute top-4 right-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <X size={22} />
      </button>
      <div data-lightbox-content className="grid justify-items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt={name}
          className="aspect-square w-[min(88vw,512px)] rounded-3xl object-cover"
        />
        <p className="text-base font-semibold text-slate-100">{name}</p>
      </div>
    </div>
  );
}
