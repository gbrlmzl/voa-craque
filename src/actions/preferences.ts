"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { TEAM_LABEL_COOKIE } from "@/lib/team-label";

const teamLabelModeSchema = z.enum(["letters", "numbers"]);

/**
 * Grava a preferencia no aparelho. E cookie e nao coluna: o servidor ja desenha
 * a pagina no modo certo, sem piscar, e nao precisa de migration. Quem ainda nao
 * entrou tambem pode escolher, entao nao exige sessao.
 */
export async function setTeamLabelModeAction(mode: string): Promise<{ ok: boolean }> {
  const parsed = teamLabelModeSchema.safeParse(mode);
  if (!parsed.success) return { ok: false };

  (await cookies()).set(TEAM_LABEL_COOKIE, parsed.data, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
  });
  return { ok: true };
}
