import { Prisma, type Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { logSecurityEvent } from "@/lib/security-log";

const PROVIDER = "google";

/** Claims do id_token do Google que importam aqui. */
export type GoogleProfile = {
  email?: string | null;
  email_verified?: boolean | null;
  name?: string | null;
  picture?: string | null;
};

/**
 * Callback `signIn` do Auth.js para o Google: decide se entra e garante que o
 * usuario exista no banco. Tres caminhos, nessa ordem:
 *
 * 1. Conta Google ja vinculada: entra (preenche a foto se estiver vazia).
 * 2. Ja existe usuario com o mesmo e-mail: vincula o Google a ele.
 * 3. Ninguem com esse e-mail: cria o usuario sem senha local.
 *
 * Devolver false vira /login?error=AccessDenied.
 */
export async function signInWithGoogle(providerAccountId: string, profile: GoogleProfile): Promise<boolean> {
  const email = profile.email?.trim().toLowerCase();

  // Vincular por e-mail so e seguro se o Google garantir que a pessoa e dona dele.
  if (!email || profile.email_verified !== true) {
    logSecurityEvent("google_login_denied", { reason: "email_not_verified", providerAccountId });
    return false;
  }

  const linked = await prisma.userAuthProvider.findUnique({
    where: { provider_providerAccountId: { provider: PROVIDER, providerAccountId } },
    select: { user: { select: { id: true, active: true, image: true } } },
  });

  if (linked) {
    if (!linked.user.active) {
      logSecurityEvent("google_login_denied", { reason: "inactive", userId: linked.user.id });
      return false;
    }
    if (!linked.user.image && profile.picture) {
      await prisma.user.update({ where: { id: linked.user.id }, data: { image: profile.picture } });
    }
    return true;
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, username: true, email: true, role: true, active: true, image: true, passwordHash: true, emailVerifiedAt: true },
  });

  if (existing) {
    if (!existing.active) {
      logSecurityEvent("google_login_denied", { reason: "inactive", userId: existing.id });
      return false;
    }
    await linkGoogleAccount(existing, providerAccountId, profile);
    return true;
  }

  return createGoogleUser(email, providerAccountId, profile);
}

/**
 * Vincula o Google a uma conta criada por senha.
 *
 * O cadastro por senha nao verifica e-mail, entao qualquer pessoa pode ter
 * criado essa conta com o e-mail de outra antes da dona chegar ("pre-account
 * hijacking"). Quando o Google prova quem e o dono do e-mail, a senha que nunca
 * foi verificada deixa de ser confiavel: ela e removida e todas as sessoes
 * abertas com ela caem. Quem criou a conta de boa-fe continua entrando, agora
 * pelo Google; quem a criou para roubar perde o acesso.
 */
type LinkableUser = {
  id: string;
  username: string;
  email: string;
  role: Role;
  image: string | null;
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
};

async function linkGoogleAccount(
  user: LinkableUser,
  providerAccountId: string,
  profile: GoogleProfile,
): Promise<void> {
  const now = new Date();
  const dropUnverifiedPassword = user.passwordHash !== null && user.emailVerifiedAt === null;

  await prisma.$transaction([
    prisma.userAuthProvider.create({ data: { userId: user.id, provider: PROVIDER, providerAccountId } }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: user.emailVerifiedAt ?? now,
        image: user.image ?? profile.picture ?? null,
        ...(dropUnverifiedPassword ? { passwordHash: null } : {}),
      },
    }),
    ...(dropUnverifiedPassword
      ? [prisma.sessionToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } })]
      : []),
  ]);

  logSecurityEvent("google_account_linked", { userId: user.id, passwordDropped: dropUnverifiedPassword });
  await recordAudit(user, {
    action: AUDIT_ACTIONS.USER_UPDATED,
    entity: "User",
    entityId: user.id,
    summary: dropUnverifiedPassword
      ? `${user.username} vinculou o Google; a senha não verificada foi removida`
      : `${user.username} vinculou o Google`,
    after: { provider: PROVIDER, passwordDropped: dropUnverifiedPassword },
  });
}

/** Base do username a partir do e-mail; sufixo numerico entra so se already em uso. */
function baseUsernameFor(email: string): string {
  const cleaned = email
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, "_")
    .slice(0, 20);
  return cleaned || "jogador";
}

async function createGoogleUser(email: string, providerAccountId: string, profile: GoogleProfile): Promise<boolean> {
  const base = baseUsernameFor(email);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const username = attempt === 0 ? base : `${base}${Math.floor(1000 + Math.random() * 9000)}`;

    try {
      const user = await prisma.user.create({
        data: {
          email,
          username,
          passwordHash: null,
          emailVerifiedAt: new Date(),
          image: profile.picture ?? null,
          authProviders: { create: { provider: PROVIDER, providerAccountId } },
        },
        select: { id: true, email: true, username: true, role: true },
      });

      await recordAudit(user, {
        action: AUDIT_ACTIONS.USER_CREATED,
        entity: "User",
        entityId: user.id,
        summary: `${user.username} criou a conta pelo Google`,
        after: { username: user.username, email: user.email, role: user.role, provider: PROVIDER },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = (error.meta?.target as string[] | undefined) ?? [];
        // Dois primeiros logins simultaneos do mesmo e-mail: o outro ja criou.
        if (target.includes("email")) return true;
        // Colisao so no username gerado: tenta de novo com um sufixo novo.
        continue;
      }
      throw error;
    }
  }

  throw new Error("Não foi possível gerar um nome de usuário único para a conta do Google.");
}

/** Callback `jwt`: o usuario do banco por tras da conta Google que acabou de autorizar. */
export async function userIdForGoogleAccount(providerAccountId: string): Promise<string | null> {
  const link = await prisma.userAuthProvider.findUnique({
    where: { provider_providerAccountId: { provider: PROVIDER, providerAccountId } },
    select: { userId: true },
  });
  return link?.userId ?? null;
}
