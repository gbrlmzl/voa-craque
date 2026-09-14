import { prisma } from "@/lib/prisma";
import { pageSuperadmin } from "@/lib/session";
import { RoleManager, type ManagedUser } from "@/components/admin/RoleManager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const superadmin = await pageSuperadmin();

  const rows = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      profile: { select: { photoUrl: true } },
    },
  });

  const users: ManagedUser[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    photoUrl: row.profile?.photoUrl ?? null,
    hasProfile: Boolean(row.profile),
  }));

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Usuários e papéis</h1>
        <p className="mt-1 text-sm text-slate-400">
          Organizador cria peladas e opera o painel. Superadmin manda no sistema inteiro.
        </p>
      </div>

      <RoleManager users={users} currentUserId={superadmin.id} />
    </div>
  );
}
