import { cache } from "react";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import type { Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { forbidden, unauthorized } from "@/lib/http";
import { SESSION_COOKIE_NAME } from "@/lib/auth/config";
import type { CurrentUser } from "@/lib/auth/current-user";
import { readSessionCookie } from "@/lib/auth/session-cookie";
import { hashSessionToken, resolveTokenState } from "@/lib/auth/session-store";

export type { CurrentUser };

const ADMIN_ROLES: Role[] = ["ADMIN", "SUPERADMIN"];

/**
 * Quem esta logado, segundo o banco. E a unica resposta que vale: o proxy so
 * decide roteamento e o UserProvider so decide o que desenhar.
 *
 * Uma consulta por requisicao (o `cache` deduplica entre layout, pagina e
 * guardas): token vivo ou em graca, do mesmo usuario que o cookie diz, ativo.
 * Logout, reuso detectado e desativacao valem na hora, sem esperar o cookie
 * expirar.
 *
 * So le. Rotacionar, confirmar sucessor e escrever cookie e trabalho exclusivo
 * do proxy.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const claims = await readSessionCookie((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!claims) return null;

  const token = await prisma.sessionToken.findUnique({
    where: { tokenHash: hashSessionToken(claims.sid) },
    select: {
      familyId: true,
      revokedAt: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          active: true,
          image: true,
          passwordHash: true,
          authProviders: { select: { provider: true } },
          profile: { select: { completed: true, photoUrl: true, name: true } },
        },
      },
    },
  });

  if (!token || token.user.id !== claims.sub || !token.user.active) return null;

  // "active" inclui o sucessor pendente: o render da requisicao que rotacionou ja o enxerga.
  const state = await resolveTokenState(token);
  if (state !== "active" && state !== "grace") return null;

  const { user } = token;
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.profile?.name ?? null,
    role: user.role,
    profileCompleted: user.profile?.completed ?? false,
    photoUrl: user.profile?.photoUrl ?? user.image ?? null,
    hasPassword: user.passwordHash !== null,
    googleLinked: user.authProviders.some((entry) => entry.provider === "google"),
  };
});

/**
 * A sessao como promise, para o layout raiz entregar ao UserProvider sem
 * `await`. Um layout que espera dado de runtime bloqueia a navegacao inteira e
 * impede o loading.tsx de aparecer; assim, so quem le o usuario espera, cada um
 * dentro do proprio <Suspense>.
 *
 * Qualquer falha vira "deslogado" com log, para a casca nunca quebrar por causa
 * da sessao. `unstable_rethrow` devolve ao Next os erros de controle de fluxo
 * dele (redirect, render dinamico), que nao sao falha.
 */
export function getSessionPromise(): Promise<CurrentUser | null> {
  return getCurrentUser().catch((error: unknown) => {
    unstable_rethrow(error);
    console.error("[voacraque] falha ao carregar a sessao", error);
    return null;
  });
}

export const getSystemSettings = cache(async () => {
  const existing = await prisma.systemSetting.findUnique({ where: { id: "global" } });
  if (existing) return existing;
  return prisma.systemSetting.create({ data: { id: "global" } });
});

export function isAdmin(user: CurrentUser | null): boolean {
  return !!user && ADMIN_ROLES.includes(user.role);
}

export function isSuperadmin(user: CurrentUser | null): boolean {
  return user?.role === "SUPERADMIN";
}

// ------------------------------------------------------------- guardas de API

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  await assertSiteOpen(user);
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isAdmin(user)) throw forbidden("Ação restrita aos organizadores.");
  return user;
}

export async function requireSuperadmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isSuperadmin(user)) throw forbidden("Ação restrita ao superadmin.");
  return user;
}

/** O superadmin continua trabalhando com o site em manutencao; o resto nao. */
export async function assertSiteOpen(user: CurrentUser | null): Promise<void> {
  const settings = await getSystemSettings();
  if (settings.publicAccessEnabled) return;
  if (isSuperadmin(user)) return;
  throw forbidden("O site está em manutenção.");
}

// ------------------------------------------------------------ guardas de pagina
//
// Cada page.tsx chama a sua. O layout de (app) nao guarda mais nada: se desse
// `await` na sessao, bloquearia toda navegacao e os loading.tsx nao apareceriam.

export async function pageUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const settings = await getSystemSettings();
  if (!settings.publicAccessEnabled && !isSuperadmin(user)) redirect("/maintenance");
  return user;
}

/** Primeiro acesso: ninguem circula pelo site sem o perfil de jogador pronto. */
export async function pageUserWithProfile(): Promise<CurrentUser> {
  const user = await pageUser();
  if (!user.profileCompleted) redirect("/onboarding");
  return user;
}

export async function pageAdmin(): Promise<CurrentUser> {
  const user = await pageUserWithProfile();
  if (!isAdmin(user)) redirect("/");
  return user;
}

export async function pageSuperadmin(): Promise<CurrentUser> {
  const user = await pageUserWithProfile();
  if (!isSuperadmin(user)) redirect("/");
  return user;
}
