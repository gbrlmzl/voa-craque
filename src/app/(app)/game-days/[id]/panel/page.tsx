import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { canWatchLive } from "@/lib/gameday-lifecycle";
import { pageAdmin } from "@/lib/session";
import { buildLiveSnapshot, getGameDayStatus } from "@/services/live";
import { Button } from "@/components/ui";
import { LivePanel } from "@/components/live/LivePanel";

export const dynamic = "force-dynamic";

export default async function LivePanelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await pageAdmin(`/game-days/${id}/panel`);

  // Antes de "Iniciar pelada" nao ha o que acompanhar: o caminho unico para iniciar e a pagina da pelada.
  const status = await getGameDayStatus(id);
  if (!status) notFound();
  if (!canWatchLive(status)) redirect(`/game-days/${id}`);

  const snapshot = await buildLiveSnapshot(id);

  return (
    <div className="grid gap-3">
      <div>
        <Link href={`/game-days/${id}`}>
          <Button variant="ghost" size="sm" className="-ml-2">
            <ArrowLeft size={16} /> {snapshot.gameDay.title}
          </Button>
        </Link>
      </div>

      <LivePanel gameDayId={id} initial={snapshot} />
    </div>
  );
}
