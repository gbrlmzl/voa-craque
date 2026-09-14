import { getSystemSettings, pageSuperadmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/labels";
import { Card, SectionTitle } from "@/components/ui";
import { SystemSettingsForm } from "@/components/admin/SystemSettingsForm";

export const dynamic = "force-dynamic";

export default async function SystemPage() {
  await pageSuperadmin();
  const settings = await getSystemSettings();

  const [users, gameDays, matches, events] = await Promise.all([
    prisma.user.count(),
    prisma.gameDay.count(),
    prisma.match.count({ where: { status: "FINISHED" } }),
    prisma.matchEvent.count(),
  ]);

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sistema</h1>
        <p className="mt-1 text-sm text-slate-400">
          Última alteração em {formatDateTime(settings.updatedAt)}.
        </p>
      </div>

      <SystemSettingsForm
        initial={{
          publicAccessEnabled: settings.publicAccessEnabled,
          registrationOpen: settings.registrationOpen,
          maintenanceMessage: settings.maintenanceMessage,
        }}
      />

      <section>
        <SectionTitle>Números do sistema</SectionTitle>
        <Card>
          <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
            <Metric label="Usuários" value={users} />
            <Metric label="Peladas" value={gameDays} />
            <Metric label="Partidas" value={matches} />
            <Metric label="Lances" value={events} />
          </div>
        </Card>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
