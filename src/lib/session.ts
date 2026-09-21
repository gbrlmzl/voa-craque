import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { forbidden, unauthorized } from "@/lib/http";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  profileCompleted: boolean;
  photoUrl: string | null;
};

const ADMIN_ROLES: Role[] = ["ADMIN", "SUPERADMIN"];

/** Le a sessao e confere o usuario no banco, para papel e perfil sempre atuais. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      profile: { select: { completed: true, photoUrl: true } },
    },
  });

  if (!user || !user.active) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    profileCompleted: user.profile?.completed ?? false,
    photoUrl: user.profile?.photoUrl ?? null,
  };
});

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

export async function pageUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const settings = await getSystemSettings();
  if (!settings.publicAccessEnabled && !isSuperadmin(user)) redirect("/manutencao");
  return user;
}

/** Primeiro acesso: ninguem circula pelo site sem o perfil de jogador pronto. */
export async function pageUserWithProfile(): Promise<CurrentUser> {
  const user = await pageUser();
  if (!user.profileCompleted) redirect("/primeiro-acesso");
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
