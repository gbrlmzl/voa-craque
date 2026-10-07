"use client";

import { useTeamName } from "@/components/providers/PreferencesProvider";

/** Escreve o nome do time no formato que o usuario escolheu ("Time A" ou "Time 1"). */
export function TeamName({ name }: { name: string }) {
  const teamName = useTeamName();
  return <>{teamName(name)}</>;
}
