import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { pageAdmin } from "@/lib/session";
import { buildLiveSnapshot } from "@/services/live";
import { Button } from "@/components/ui";
import { LivePanel } from "@/components/live/LivePanel";

export const dynamic = "force-dynamic";

export default async function LivePanelPage({ params }: { params: Promise<{ id: string }> }) {
  await pageAdmin();
  const { id } = await params;
  const snapshot = await buildLiveSnapshot(id);

  return (
    <div className="grid gap-3">
      <div>
        <Link href={`/peladas/${id}`}>
          <Button variant="ghost" size="sm" className="-ml-2">
            <ArrowLeft size={16} /> {snapshot.gameDay.title}
          </Button>
        </Link>
      </div>

      <LivePanel gameDayId={id} initial={snapshot} />
    </div>
  );
}
