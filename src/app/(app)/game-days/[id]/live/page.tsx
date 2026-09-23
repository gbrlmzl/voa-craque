import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { pageUserWithProfile } from "@/lib/session";
import { buildLiveSnapshot } from "@/services/live";
import { Button } from "@/components/ui";
import { LiveBoard } from "@/components/live/LiveBoard";

export const dynamic = "force-dynamic";

export default async function SpectatorPage({ params }: { params: Promise<{ id: string }> }) {
  await pageUserWithProfile();
  const { id } = await params;
  const snapshot = await buildLiveSnapshot(id);

  return (
    <div className="grid gap-3">
      <div>
        <Link href={`/game-days/${id}`}>
          <Button variant="ghost" size="sm" className="-ml-2">
            <ArrowLeft size={16} /> {snapshot.gameDay.title}
          </Button>
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Ao vivo</h1>
      </div>

      <LiveBoard gameDayId={id} initial={snapshot} />
    </div>
  );
}
