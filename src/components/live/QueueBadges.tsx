"use client";

import { cn } from "@/components/ui";
import { useTeamName } from "@/components/providers/PreferencesProvider";
import { teamColor } from "@/lib/labels";

/** A fila de times esperando: cada um abre o modal com elenco e retrospecto. */
export function QueueBadges({
  queue,
  disabled = false,
  onSelect,
}: {
  queue: { id: string; name: string }[];
  disabled?: boolean;
  onSelect: (teamId: string) => void;
}) {
  const teamName = useTeamName();

  return (
    <div className="flex flex-wrap gap-2">
      {queue.map((team, index) => (
        <button
          key={team.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(team.id)}
          aria-label={`Ver ${teamName(team.name)}, ${index + 1}º na fila`}
          className={cn(
            "touch-target inline-flex items-center rounded-full border border-white/10 bg-white/8 px-4 text-sm font-medium transition-colors hover:bg-white/12 active:scale-95 disabled:opacity-40",
            teamColor(team.name).text,
          )}
        >
          {index + 1}º · {teamName(team.name)}
        </button>
      ))}
    </div>
  );
}
