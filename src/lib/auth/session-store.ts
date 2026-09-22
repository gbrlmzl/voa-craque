import { createHash, randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { SESSION_GRACE_S, SESSION_IDLE_TTL_S } from "@/lib/auth/config";
import { classifyToken, withinGrace, type TokenRow, type TokenState } from "@/lib/auth/token-state";
import { logSecurityEvent } from "@/lib/security-log";

/**
 * Ciclo de vida dos tokens de sessao no banco. O token e um valor opaco de 32
 * bytes que so existe dentro do cookie cifrado; aqui fica o SHA-256 (nao bcrypt:
 * o valor ja e aleatorio de alta entropia, nao uma senha escolhida por gente).
 * Um dump do banco nao devolve sessao a ninguem.
 *
 * Numa familia existem no maximo:
 * - um token ATUAL: ja usado pelo navegador (usedAt preenchido), nao revogado;
 * - um token PENDENTE: emitido pela rotacao, ainda nao visto (usedAt nulo).
 *
 * O atual so e revogado quando o navegador devolve o pendente num cookie (a
 * confirmacao). Se a resposta que levava o pendente se perder (aba fechada,
 * rede do celular caindo), o navegador continua com o atual, que continua
 * valendo, e a proxima rotacao troca o pendente perdido por outro. Revogar ja
 * na rotacao faria esse caso banal ser lido como roubo.
 */

export function hashSessionToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

const newRawToken = (): string => randomBytes(32).toString("base64url");
const expiresFrom = (now: Date): Date => new Date(now.getTime() + SESSION_IDLE_TTL_S * 1000);
const hashPrefix = (raw: string): string => hashSessionToken(raw).slice(0, 12);

type FamilyRow = TokenRow & { id: string; familyId: string; usedAt: Date | null };

async function hasLiveToken(familyId: string, now: Date): Promise<boolean> {
  const live = await prisma.sessionToken.findFirst({
    where: { familyId, revokedAt: null, expiresAt: { gt: now } },
    select: { id: true },
  });
  return live !== null;
}

/** Classifica uma linha ja carregada, com a consulta extra so quando ela pode mudar a resposta. */
export async function resolveTokenState(
  row: (TokenRow & { familyId: string }) | null,
  now = new Date(),
): Promise<TokenState> {
  const successor =
    row?.revokedAt && withinGrace(row.revokedAt, now) ? await hasLiveToken(row.familyId, now) : false;
  return classifyToken(row, successor, now);
}

async function findToken(raw: string): Promise<(FamilyRow & { userId: string }) | null> {
  return prisma.sessionToken.findUnique({
    where: { tokenHash: hashSessionToken(raw) },
    select: { id: true, userId: true, familyId: true, usedAt: true, revokedAt: true, expiresAt: true },
  });
}

/** Login: abre uma familia nova com um token ja "atual" e devolve o valor puro, que vai so para o cookie. */
export async function openSession(userId: string): Promise<string> {
  const now = new Date();
  const raw = newRawToken();
  await prisma.sessionToken.create({
    data: {
      userId,
      familyId: randomUUID(),
      tokenHash: hashSessionToken(raw),
      expiresAt: expiresFrom(now),
      usedAt: now,
    },
  });
  // Faxina oportunista: o login ja paga um round trip, e mantem o usuario ativo
  // com poucas linhas mesmo sem a purga agendada.
  await purgeDeadSessionTokens({ userId, now });
  return raw;
}

/**
 * O que o proxy faz com um token que ele vai mexer (rotacionar ou confirmar).
 * E aqui que o reuso e detectado: um token revogado que volta fora da janela de
 * graca e uma copia que alguem guardou, e a familia inteira cai.
 */
async function inspectForProxy(raw: string, now: Date, meta: { ip: string }) {
  const row = await findToken(raw);
  const state = await resolveTokenState(row, now);

  if (state === "grace") {
    logSecurityEvent("session_token_grace_reuse", { userId: row?.userId, familyId: row?.familyId, ip: meta.ip });
    return { outcome: "grace" as const };
  }

  if (state === "reused" && row) {
    await prisma.sessionToken.updateMany({
      where: { familyId: row.familyId, revokedAt: null },
      data: { revokedAt: now },
    });
    logSecurityEvent("session_token_reuse", {
      userId: row.userId,
      familyId: row.familyId,
      tokenHashPrefix: hashPrefix(raw),
      ip: meta.ip,
    });
    return { outcome: "invalid" as const };
  }

  if (state !== "active" || !row) return { outcome: "invalid" as const };
  return { outcome: "active" as const, row };
}

export type ProxyResult =
  /** Emitiu um sucessor pendente; `raw` vai para o cookie com `pend`. */
  | { status: "rotated"; raw: string }
  /** Confirmou o sucessor; o mesmo sid volta ao cookie, sem `pend`. */
  | { status: "acknowledged" }
  /** Nada a fazer nesta resposta (requisicao em voo, ou sucessor ja a caminho). */
  | { status: "grace" }
  | { status: "invalid" };

/**
 * O navegador devolveu um cookie com `pend`: e a prova de que recebeu o
 * sucessor. So agora o resto da familia (o antigo atual e qualquer pendente
 * perdido) e aposentado. A prova tem que vir do cookie de ENTRADA, que so o
 * proxy ve: o Next repassa ao render os cookies gravados pelo proxy, entao o
 * render da propria requisicao que rotacionou ja enxerga o sucessor.
 */
export async function acknowledgeSessionToken(raw: string, meta: { ip: string }): Promise<ProxyResult> {
  const now = new Date();
  const inspected = await inspectForProxy(raw, now, meta);
  if (inspected.outcome !== "active") return { status: inspected.outcome };

  const { row } = inspected;
  await prisma.$transaction([
    prisma.sessionToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } }),
    prisma.sessionToken.updateMany({
      where: { familyId: row.familyId, id: { not: row.id }, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
  return { status: "acknowledged" };
}

/** Emite um sucessor pendente para um token que passou da idade de rotacao. */
export async function rotateSessionToken(raw: string, meta: { ip: string }): Promise<ProxyResult> {
  const now = new Date();
  const inspected = await inspectForProxy(raw, now, meta);
  if (inspected.outcome !== "active") return { status: inspected.outcome };

  const { row } = inspected;
  const next = newRawToken();
  const issued = await prisma.$transaction(async (tx) => {
    // Serializa as rotacoes do mesmo token: abas e requisicoes em paralelo chegam
    // juntas com o mesmo cookie, e so a primeira pode emitir o sucessor.
    await tx.$queryRaw`SELECT id FROM "SessionToken" WHERE id = ${row.id} FOR UPDATE`;

    const recent = await tx.sessionToken.findFirst({
      where: {
        familyId: row.familyId,
        id: { not: row.id },
        usedAt: null,
        revokedAt: null,
        createdAt: { gt: new Date(now.getTime() - SESSION_GRACE_S * 1000) },
      },
      select: { id: true },
    });
    if (recent) return false;

    // Pendente mais velho que a janela: a resposta que o levava se perdeu.
    await tx.sessionToken.updateMany({
      where: { familyId: row.familyId, id: { not: row.id }, usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.sessionToken.create({
      data: { userId: row.userId, familyId: row.familyId, tokenHash: hashSessionToken(next), expiresAt: expiresFrom(now) },
    });
    return true;
  });

  return issued ? { status: "rotated", raw: next } : { status: "grace" };
}

/** O cookie decifra, mas a sessao ainda vale no banco? Usado pelo proxy nas rotas so-de-deslogado. */
export async function isSessionAlive(raw: string): Promise<boolean> {
  const state = await resolveTokenState(await findToken(raw));
  return state === "active" || state === "grace";
}

/** Logout: derruba a familia inteira deste dispositivo, nao so o token atual. */
export async function revokeSessionFamily(raw: string): Promise<void> {
  const row = await findToken(raw);
  if (!row) return;
  await prisma.sessionToken.updateMany({
    where: { familyId: row.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Remove as linhas que nenhum cookie consegue mais apresentar. O JWE do cookie
 * expira no mesmo instante que a linha (mesmo maxAge), entao depois do
 * expiresAt a linha nao serve nem para detectar reuso. Um dia de folga cobre a
 * tolerancia de relogio da decifragem.
 */
export async function purgeDeadSessionTokens({
  userId,
  now = new Date(),
}: { userId?: string; now?: Date } = {}): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const { count } = await prisma.sessionToken.deleteMany({
    where: { ...(userId ? { userId } : {}), expiresAt: { lt: cutoff } },
  });
  return count;
}
