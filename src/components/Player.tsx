"use client";

import type { ReactNode } from "react";
import { Star } from "lucide-react";
import { Badge, cn } from "@/components/ui";
import { usePlayerModal } from "@/components/providers/PlayerModalProvider";

// ---------------------------------------------------------------- avatar

const AVATAR_SIZES = {
  sm: "h-9 w-9 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-20 w-20 text-xl",
} as const;

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function Avatar({
  name,
  photoUrl,
  size = "md",
  className,
}: {
  name: string;
  photoUrl?: string | null;
  size?: keyof typeof AVATAR_SIZES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-night-700 font-semibold text-slate-300 ring-1 ring-white/10",
        AVATAR_SIZES[size],
        className,
      )}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}

// ---------------------------------------------------------------- estrelas

export function Stars({ value, size = 16 }: { value: number | null; size?: number }) {
  if (value === null) {
    return <span className="text-xs text-slate-500">sem avaliação</span>;
  }
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((slot) => {
        const fill = Math.min(1, Math.max(0, value - slot + 1));
        return (
          <span key={slot} className="relative inline-block" style={{ width: size, height: size }}>
            <Star size={size} className="absolute inset-0 text-slate-600" />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star size={size} className="text-amber-400" fill="currentColor" />
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function SkillTag({ label, polarity }: { label: string; polarity: "POSITIVE" | "NEGATIVE" }) {
  return <Badge tone={polarity === "POSITIVE" ? "good" : "bad"}>{label}</Badge>;
}

// ---------------------------------------------------------------- chip

/** Nome do jogador clicavel: abre o modal em qualquer lugar do site. */
export function PlayerChip({
  userId,
  name,
  photoUrl,
  subtitle,
  size = "sm",
  className,
}: {
  userId: string;
  name: string;
  photoUrl?: string | null;
  subtitle?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}) {
  const { open } = usePlayerModal();
  return (
    <button
      type="button"
      onClick={() => open(userId)}
      className={cn(
        "flex min-w-0 items-center gap-2.5 rounded-xl px-1.5 py-1 text-left hover:bg-white/5",
        className,
      )}
    >
      <Avatar name={name} photoUrl={photoUrl} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-slate-100">{name}</span>
        {subtitle ? <span className="block truncate text-xs text-slate-500">{subtitle}</span> : null}
      </span>
    </button>
  );
}
