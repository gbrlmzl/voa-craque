"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { Avatar, SkillTag, Stars } from "@/components/player";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, EmptyState, Input, cn } from "@/components/ui";
import { SKILL_HINTS } from "@/lib/skills";

export type EvaluationPlayer = {
  userId: string;
  name: string;
  nickname: string | null;
  photoUrl: string | null;
  positionLabel: string;
  stars: number | null;
  skillCodes: string[];
};

export type SkillOption = { code: string; label: string; polarity: "POSITIVE" | "NEGATIVE" };

const STAR_STEPS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

export function PlayerEvaluation({
  players,
  skills,
}: {
  players: EvaluationPlayer[];
  skills: SkillOption[];
}) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = players.filter((player) =>
    `${player.name} ${player.nickname ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const unrated = players.filter((player) => player.stars === null).length;

  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-500" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar jogador"
          className="pl-9"
        />
      </div>

      {unrated > 0 ? (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          {unrated} {unrated === 1 ? "jogador ainda não tem" : "jogadores ainda não têm"} estrelas. Sem
          isso, o sorteio usa a mediana do grupo.
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState title="Nenhum jogador encontrado" />
      ) : (
        filtered.map((player) => (
          <PlayerRow
            key={player.userId}
            player={player}
            skills={skills}
            expanded={openId === player.userId}
            onToggle={() => setOpenId(openId === player.userId ? null : player.userId)}
          />
        ))
      )}
    </div>
  );
}

function PlayerRow({
  player,
  skills,
  expanded,
  onToggle,
}: {
  player: EvaluationPlayer;
  skills: SkillOption[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [stars, setStars] = useState<number | null>(player.stars);
  const [selected, setSelected] = useState<string[]>(player.skillCodes);
  const [saving, setSaving] = useState(false);

  const dirty =
    stars !== player.stars ||
    selected.length !== player.skillCodes.length ||
    selected.some((code) => !player.skillCodes.includes(code));

  async function save() {
    setSaving(true);
    try {
      const response = await fetch(`/api/jogadores/${player.userId}/avaliacao`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stars, skillCodes: selected }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível salvar.");
      toast.show({ message: `${player.name} avaliado.`, tone: "success" });
      router.refresh();
    } catch (error) {
      toast.show({ message: (error as Error).message, tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  const chosenSkills = skills.filter((skill) => player.skillCodes.includes(skill.code));

  return (
    <Card className="p-3">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 text-left">
        <Avatar name={player.name} photoUrl={player.photoUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-100">{player.name}</p>
          <p className="truncate text-xs text-slate-500">{player.positionLabel}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Stars value={player.stars} size={13} />
            {chosenSkills.slice(0, 2).map((skill) => (
              <SkillTag key={skill.code} label={skill.label} polarity={skill.polarity} />
            ))}
            {chosenSkills.length > 2 ? <Badge>+{chosenSkills.length - 2}</Badge> : null}
          </div>
        </div>
        <ChevronDown size={18} className={cn("shrink-0 text-slate-500 transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded ? (
        <div className="mt-4 grid gap-4 border-t border-white/10 pt-4">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">Estrelas</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setStars(null)}
                className={cn(
                  "h-10 rounded-xl border px-3 text-sm",
                  stars === null
                    ? "border-slate-400 bg-white/10 text-slate-100"
                    : "border-white/10 bg-night-800 text-slate-400",
                )}
              >
                sem nota
              </button>
              {STAR_STEPS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStars(value)}
                  className={cn(
                    "h-10 w-12 rounded-xl border text-sm font-semibold tabular-nums",
                    stars === value
                      ? "border-amber-400 bg-amber-400/15 text-amber-300"
                      : "border-white/10 bg-night-800 text-slate-400",
                  )}
                >
                  {value.toFixed(1).replace(".", ",")}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
              Skills e contra-skills
            </p>
            <div className="flex flex-wrap gap-1.5">
              {skills.map((skill) => {
                const active = selected.includes(skill.code);
                return (
                  <button
                    key={skill.code}
                    type="button"
                    title={SKILL_HINTS[skill.code]}
                    onClick={() =>
                      setSelected((current) =>
                        current.includes(skill.code)
                          ? current.filter((code) => code !== skill.code)
                          : [...current, skill.code],
                      )
                    }
                    className={cn(
                      "h-10 rounded-xl border px-3 text-sm",
                      active && skill.polarity === "POSITIVE"
                        ? "border-pitch-500 bg-pitch-500/15 text-pitch-300"
                        : active
                          ? "border-rose-500 bg-rose-500/15 text-rose-300"
                          : "border-white/10 bg-night-800 text-slate-400",
                    )}
                  >
                    {skill.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Button size="lg" onClick={save} disabled={saving || !dirty}>
            {saving ? "Salvando..." : "Salvar avaliação"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
