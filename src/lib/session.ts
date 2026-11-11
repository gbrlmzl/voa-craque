import { cache } from "react";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import type { Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { forbidden, unauthorized } from "@/lib/http";
import { ACCESS_COOKIE_NAME } from "@/lib/auth/config";
import type { CurrentUser } from "@/lib/auth/current-user";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { loginHref, onboardingHref } from "@/lib/auth/routes";
import { decideAccess } from "@/lib/site-access";

export type { CurrentUser };

const ADMIN_ROLES: Role[] = ["ADMIN", "SUPERADMIN"];

/**
 * Quem esta logado. E a unica resposta que vale: o proxy so decide roteamento e
 * o UserProvider so decide o que desenhar.
 *
 * Autoridade = access JWT valido (assinatura, iss, aud, exp) + usuario ativo no
 * banco. Uma consulta por requisicao (o `cache` deduplica entre layout, pagina e
 * guardas): desativacao e troca de papel valem na hora, porque o papel nao vai
 * no token.
 *
 * NAO consulta o refresh token: o access e stateless, e por isso nao e
 * revogavel nos seus 15 minutos (logout e troca de senha derrubam o aparelho na
 * proxima renovacao). Quem renova e o proxy.
 *
 * So le. Gravar cookie e trabalho do proxy, das actions e dos route handlers
 * de /api/auth/*: num Server Component o Next lanca em cookies().set.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const claims = await verifyAccessToken((await cookies()).get(ACCESS_COOKIE_NAME)?.value);
  if (!claims) return null;

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
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
  });

  if (!user || !user.active) return null;

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

/**
 * API de consulta (leitura que um visitante pode fazer com o site aberto a
 * visitantes): devolve o usuario, ou null se for visitante e puder ver. Nao exige
 * perfil, como requireUser. Quem grava continua com requireUser/requireAdmin.
 */
export async function requireViewer(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  const decision = decideAccess(user, await getSystemSettings());
  if (decision === "login") throw unauthorized();
  if (decision === "maintenance") throw forbidden("O site está em manutenção.");
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

// `from` e o caminho da pagina que chama a guarda: um Server Component nao sabe a
// propria URL, entao cada pagina informa o dela e o login/onboarding devolve a
// pessoa para la. Querystring nao e preservada (o proxy preserva quando e ele
// quem barra).

export async function pageUser(from = "/"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref(from));
  if (decideAccess(user, await getSystemSettings()) === "maintenance") redirect("/maintenance");
  return user;
}

/** Primeiro acesso: ninguem circula pelo site sem o perfil de jogador pronto. */
export async function pageUserWithProfile(from = "/"): Promise<CurrentUser> {
  const user = await pageUser(from);
  if (!user.profileCompleted) redirect(onboardingHref(from));
  return user;
}

/**
 * Pagina de consulta: devolve o usuario, ou null quando o visitante pode ver
 * (site liberado e "Site privado" desligado). Site privado vai para /login,
 * manutencao para /maintenance; quem esta logado sem perfil vai para o onboarding.
 */
export async function pageViewer(from: string): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  const decision = decideAccess(user, await getSystemSettings());
  if (decision === "maintenance") redirect("/maintenance");
  if (decision === "login") redirect(loginHref(from));
  if (user && !user.profileCompleted) redirect(onboardingHref(from));
  return user;
}

export async function pageAdmin(from = "/"): Promise<CurrentUser> {
  const user = await pageUserWithProfile(from);
  if (!isAdmin(user)) redirect("/");
  return user;
}

export async function pageSuperadmin(from = "/"): Promise<CurrentUser> {
  const user = await pageUserWithProfile(from);
  if (!isSuperadmin(user)) redirect("/");
  return user;
}
