"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Star, X } from "lucide-react";
import { Badge, Button, cn } from "@/components/ui";

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

// ---------------------------------------------------------------- modal

export type PlayerDetail = {
  userId: string;
  name: string;
  nickname: string | null;
  photoUrl: string | null;
  position: string;
  positionLabel: string;
  footLabel: string;
  age: number;
  heightCm: number;
  weightKg: number;
  stars: number | null;
  skills: { code: string; label: string; polarity: "POSITIVE" | "NEGATIVE" }[];
  stats: { goals: number; assists: number; played: number; won: number; winRate: number };
};

type ModalApi = { open: (userId: string) => void };

const PlayerModalContext = createContext<ModalApi | null>(null);

export function usePlayerModal(): ModalApi {
  const context = useContext(PlayerModalContext);
  if (!context) throw new Error("usePlayerModal precisa do PlayerModalProvider.");
  return context;
}

export function PlayerModalProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [player, setPlayer] = useState<PlayerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback((id: string) => {
    setUserId(id);
    setPlayer(null);
    setError(null);
  }, []);

  const close = useCallback(() => setUserId(null), []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetch(`/api/jogadores/${userId}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar o jogador.");
        return body as PlayerDetail;
      })
      .then((data) => active && setPlayer(data))
      .catch((err: Error) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [userId, close]);

  const api = useMemo<ModalApi>(() => ({ open }), [open]);

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

                <div className="mt-5">
                  <p className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">Skills</p>
                  {player.skills.length === 0 ? (
                    <p className="text-sm text-slate-500">Nenhuma skill atribuída ainda.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {player.skills.map((skill) => (
                        <SkillTag key={skill.code} label={skill.label} polarity={skill.polarity} />
                      ))}
                    </div>
                  )}
                </div>

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
