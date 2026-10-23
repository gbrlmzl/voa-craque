import { route } from "@/lib/http";
import { requireSuperadmin } from "@/lib/session";
import { recomputeAllRatings } from "@/services/rating";

export const dynamic = "force-dynamic";

/** Recalcula o MMR de todos a partir das peladas encerradas. Apaga ajustes manuais. */
export async function POST() {
  return route(async () => {
    const superadmin = await requireSuperadmin();
    return recomputeAllRatings(superadmin);
  });
}
