import type { NextRequest } from "next/server";
import { route } from "@/lib/http";
import { requireAdmin } from "@/lib/session";
import { adminRegistrationSchema } from "@/lib/validation";
import { registerPlayersByAdmin } from "@/services/registrations";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const input = adminRegistrationSchema.parse(await req.json());
    return registerPlayersByAdmin(id, admin, input);
  });
}
