"use client";

import { Card, cn } from "@/components/ui";
import { usePreferencesForm } from "@/hooks/usePreferencesForm";
import type { TeamLabelMode } from "@/lib/team-label";

const OPTIONS: { mode: TeamLabelMode; label: string }[] = [
  { mode: "letters", label: "Letras (Time A)" },
  { mode: "numbers", label: "Números (Time 1)" },
];

/** So muda como os nomes aparecem para quem escolheu: no banco os times seguem sendo A, B, C. */
export function PreferencesForm() {
  const { mode, choose, saving, preview } = usePreferencesForm();

  return (
    <Card className="grid gap-3">
      <p className="text-sm font-medium text-slate-300">Nome dos times</p>

      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.mode}
            type="button"
            aria-pressed={mode === option.mode}
            disabled={saving}
            onClick={() => choose(option.mode)}
            className={cn(
              "touch-target rounded-xl px-3 text-sm font-semibold transition-colors disabled:opacity-60",
              mode === option.mode
                ? "bg-pitch-500/15 text-pitch-300 ring-1 ring-pitch-500/50"
                : "bg-night-800/60 text-slate-300 ring-1 ring-white/10 hover:bg-night-800",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className="text-sm text-slate-400">Assim: {preview}</p>
    </Card>
  );
}
