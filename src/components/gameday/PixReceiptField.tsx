"use client";

import { useRef } from "react";
import { Copy, Eye, Receipt, X } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * Chave PIX (toque para copiar) e o anexo do comprovante. Usado na inscricao e na
 * troca para PIX: o arquivo so e escolhido aqui, quem usa decide quando enviar.
 */
export function PixReceiptField({
  pixKey,
  receipt,
  busy,
  onPick,
  onView,
  onRemove,
  onCopyPixKey,
}: {
  pixKey: string | null;
  receipt: { file: File } | null;
  busy: boolean;
  onPick: (file: File) => void;
  onView: () => void;
  onRemove: () => void;
  onCopyPixKey: (pixKey: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="grid gap-3">
      {pixKey ? (
        <button
          type="button"
          onClick={() => onCopyPixKey(pixKey)}
          className="flex items-center justify-between gap-2 rounded-xl bg-night-800 px-3 py-3 text-left"
        >
          <span className="min-w-0">
            <span className="block text-xs text-slate-500">Chave PIX</span>
            <span className="block truncate text-sm text-slate-200">{pixKey}</span>
          </span>
          <Copy size={16} className="shrink-0 text-slate-400" />
        </button>
      ) : (
        <p className="text-sm text-slate-400">O organizador não cadastrou chave PIX.</p>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Zera o valor: depois de um X, o mesmo arquivo pode ser escolhido de novo.
          event.target.value = "";
          if (file) onPick(file);
        }}
      />

      {receipt ? (
        <div className="flex h-14 items-center gap-1 rounded-xl bg-night-800 px-3">
          <Receipt size={18} className="shrink-0 text-pitch-400" aria-hidden />
          <span className="ml-2 min-w-0 flex-1 truncate text-sm text-slate-200" title={receipt.file.name}>
            {receipt.file.name}
          </span>
          <button
            type="button"
            onClick={onView}
            disabled={busy}
            aria-label="Ver comprovante"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-300 transition-colors hover:bg-white/5 disabled:opacity-45"
          >
            <Eye size={18} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            aria-label="Remover comprovante"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-300 transition-colors hover:bg-white/5 disabled:opacity-45"
          >
            <X size={18} />
          </button>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
        >
          <Receipt size={16} /> Anexar comprovante
        </Button>
      )}
    </div>
  );
}
