"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type GameDayValues = {
  title: string;
  scheduledAt: string;
  location: string;
  price: string;
  durationMin: string;
  goalsToWin: string;
  maxPlayers: string;
  teamSize: string;
  pixKey: string;
  notes: string;
};

export const NEW_GAMEDAY: GameDayValues = {
  title: "",
  scheduledAt: "",
  location: "",
  price: "4,50",
  durationMin: "10",
  goalsToWin: "2",
  maxPlayers: "20",
  teamSize: "5",
  pixKey: "",
  notes: "",
};

function toCents(value: string): number {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : Number.NaN;
}

export function useGameDayForm(initial: GameDayValues, gameDayId?: string) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof GameDayValues>(key: K, value: GameDayValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setMessage(null);

    const payload = {
      title: values.title,
      scheduledAt: values.scheduledAt,
      location: values.location,
      pricePerPlayerCents: toCents(values.price),
      matchDurationSec: Number(values.durationMin) * 60,
      goalsToWin: Number(values.goalsToWin),
      maxPlayers: Number(values.maxPlayers),
      teamSize: Number(values.teamSize),
      pixKey: values.pixKey,
      notes: values.notes,
    };

    try {
      const response = await fetch(gameDayId ? `/api/game-days/${gameDayId}` : "/api/game-days", {
        method: gameDayId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();

      if (!response.ok) {
        if (body.details && typeof body.details === "object") setErrors(body.details);
        throw new Error(body.error ?? "Não foi possível salvar a pelada.");
      }

      router.push(gameDayId ? `/game-days/${gameDayId}` : `/game-days/${body.id}`);
      router.refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return { values, set, errors, message, saving, submit };
}
