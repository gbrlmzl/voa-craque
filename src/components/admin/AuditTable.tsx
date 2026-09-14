"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge, Card, EmptyState, cn } from "@/components/ui";
import { AUDIT_ACTION_LABEL, type AuditAction } from "@/lib/audit-actions";

export type AuditRow = {
  id: string;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
};

function actionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action as AuditAction] ?? action;
}

function tone(action: string): "good" | "bad" | "warn" | "neutral" {
  if (action.includes("UNDONE") || action.includes("REJECTED") || action.includes("CANCELLED")) return "bad";
  if (action.includes("FINISHED") || action.includes("CONFIRMED")) return "good";
  if (action.includes("ROLE") || action.includes("SYSTEM")) return "warn";
  return "neutral";
}

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) {
    return <EmptyState title="Nenhum registro no filtro" description="Ajuste o período ou o tipo de ação." />;
  }

  return (
    <div className="grid gap-2">
      {rows.map((row) => (
        <AuditEntry key={row.id} row={row} />
      ))}
    </div>
  );
}

function AuditEntry({ row }: { row: AuditRow }) {
  const [open, setOpen] = useState(false);
  const hasDiff = row.before !== null || row.after !== null;

  return (
    <Card className="p-3">
      <button
        type="button"
        onClick={() => hasDiff && setOpen((value) => !value)}
        className="flex w-full items-start gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={tone(row.action)}>{actionLabel(row.action)}</Badge>
            <span className="text-xs text-slate-500">
              {new Date(row.createdAt).toLocaleString("pt-BR")}
            </span>
          </div>

          <p className="mt-1.5 text-sm text-slate-200">{row.summary ?? `${row.entity} ${row.entityId ?? ""}`}</p>

          <p className="mt-1 text-xs text-slate-500">
            {row.actorName ? `${row.actorName} (${row.actorEmail})` : "Sistema"}
            {row.actorRole ? ` · ${row.actorRole}` : ""}
            {row.ip ? ` · ${row.ip}` : ""}
          </p>

          <p className="mt-0.5 truncate text-[11px] text-slate-600">
            {row.entity}
            {row.entityId ? `#${row.entityId}` : ""}
            {row.userAgent ? ` · ${row.userAgent}` : ""}
          </p>
        </div>

        {hasDiff ? (
          <ChevronDown
            size={18}
            className={cn("mt-1 shrink-0 text-slate-500 transition-transform", open && "rotate-180")}
          />
        ) : null}
      </button>

      {open && hasDiff ? (
        <div className="mt-3 grid gap-2 border-t border-white/10 pt-3 sm:grid-cols-2">
          <DiffBlock title="Antes" value={row.before} />
          <DiffBlock title="Depois" value={row.after} />
        </div>
      ) : null}
    </Card>
  );
}

function DiffBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</p>
      <pre className="max-h-56 overflow-auto rounded-xl bg-night-950 p-2.5 text-[11px] leading-relaxed text-slate-400">
        {value === null || value === undefined ? "—" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
