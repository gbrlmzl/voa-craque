import type { NextRequest } from "next/server";
import { route } from "@/lib/http";
import { requireAdmin } from "@/lib/session";
import { listRegistrationCandidates } from "@/services/registrations";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    await requireAdmin();
    const { id } = await ctx.params;
    return { candidates: await listRegistrationCandidates(id) };
  });
}
