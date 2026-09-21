import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { pageSuperadmin } from "@/lib/session";
import { AUDIT_ACTION_LABEL, AUDIT_ENTITIES, type AuditAction } from "@/lib/audit-actions";
import { auditQuerySchema } from "@/lib/validation";
import { Button, Card, Input, Select } from "@/components/ui";
import { AuditTable, type AuditRow } from "@/components/admin/AuditTable";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await pageSuperadmin();
  const raw = await searchParams;
  const filters = auditQuerySchema.parse(raw);

  const where: Prisma.AuditLogWhereInput = {};
  if (filters.actorId) where.actorId = filters.actorId;
  if (filters.entity) where.entity = filters.entity;
  if (filters.action) where.action = filters.action;
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00`) } : {}),
      ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59`) } : {}),
    };
  }

  const [logs, total, actors] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({
      where: { auditLogs: { some: {} } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows: AuditRow[] = logs.map((log) => ({
    id: log.id,
    createdAt: log.createdAt.toISOString(),
    actorName: log.actor?.name ?? null,
    actorEmail: log.actorEmail,
    actorRole: log.actorRole,
    action: log.action,
    entity: log.entity,
    entityId: log.entityId,
    summary: log.summary,
    before: log.before,
    after: log.after,
    ip: log.ip,
    userAgent: log.userAgent,
  }));

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageLink = (page: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(raw)) {
      if (value && key !== "page") query.set(key, value);
    }
    query.set("page", String(page));
    return `/admin/auditoria?${query.toString()}`;
  };

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Auditoria</h1>
        <p className="mt-1 text-sm text-slate-400">
          {total} registros. Cada linha guarda quem fez, o que mudou, de onde e quando.
        </p>
      </div>

      <Card>
        <form className="grid gap-3 sm:grid-cols-5">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs text-slate-400">Ator</span>
            <Select name="actorId" defaultValue={filters.actorId ?? ""}>
              <option value="">Todos</option>
              {actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs text-slate-400">Entidade</span>
            <Select name="entity" defaultValue={filters.entity ?? ""}>
              <option value="">Todas</option>
              {AUDIT_ENTITIES.map((entity) => (
                <option key={entity} value={entity}>
                  {entity}
                </option>
              ))}
            </Select>
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs text-slate-400">Ação</span>
            <Select name="action" defaultValue={filters.action ?? ""}>
              <option value="">Todas</option>
              {(Object.keys(AUDIT_ACTION_LABEL) as AuditAction[]).map((action) => (
                <option key={action} value={action}>
                  {AUDIT_ACTION_LABEL[action]}
                </option>
              ))}
            </Select>
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs text-slate-400">De</span>
            <Input type="date" name="from" defaultValue={filters.from ?? ""} />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs text-slate-400">Até</span>
            <Input type="date" name="to" defaultValue={filters.to ?? ""} />
          </label>

          <div className="flex items-end gap-2 sm:col-span-1">
            <Button type="submit" size="lg" className="w-full">
              Filtrar
            </Button>
          </div>
        </form>
      </Card>

      <AuditTable rows={rows} />

      {pages > 1 ? (
        <div className="flex items-center justify-between">
          <Link href={pageLink(Math.max(1, filters.page - 1))}>
            <Button variant="secondary" disabled={filters.page <= 1}>
              Anterior
            </Button>
          </Link>
          <span className="text-sm text-slate-500">
            Página {filters.page} de {pages}
          </span>
          <Link href={pageLink(Math.min(pages, filters.page + 1))}>
            <Button variant="secondary" disabled={filters.page >= pages}>
              Próxima
            </Button>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
