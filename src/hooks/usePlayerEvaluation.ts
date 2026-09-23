"use client";

import { useState } from "react";

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

export function usePlayerEvaluation(players: EvaluationPlayer[]) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = players.filter((player) =>
    `${player.name} ${player.nickname ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const unrated = players.filter((player) => player.stars === null).length;

  function toggle(userId: string) {
    setOpenId((current) => (current === userId ? null : userId));
  }

  return { query, setQuery, openId, toggle, filtered, unrated };
}
