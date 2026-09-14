import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuditAction, AuditEntity } from "@/lib/audit-actions";
import type { CurrentUser } from "@/lib/session";

export { AUDIT_ACTIONS } from "@/lib/audit-actions";
export type { AuditAction, AuditEntity } from "@/lib/audit-actions";

export type AuditInput = {
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
};

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || null;
    return { ip, userAgent: headerList.get("user-agent") };
  } catch {
    return { ip: null, userAgent: null };
  }
}

/**
 * Ponto unico de escrita do log. Toda mutacao relevante passa por aqui.
 * Falha de auditoria nunca derruba a operacao principal, mas vai para o console.
 */
export async function recordAudit(actor: CurrentUser | null, input: AuditInput): Promise<void> {
  const { ip, userAgent } = await requestMeta();
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actor?.id ?? null,
        actorEmail: actor?.email ?? null,
        actorRole: actor?.role ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        summary: input.summary ?? null,
        before: toJson(input.before),
        after: toJson(input.after),
        ip,
        userAgent,
      },
    });
  } catch (error) {
    console.error("[voacraque] falha ao gravar auditoria", input.action, error);
  }
}
