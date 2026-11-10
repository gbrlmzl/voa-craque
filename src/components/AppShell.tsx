"use client";

import Link from "next/link";
import { Suspense } from "react";
import {
  CalendarDays,
  ClipboardList,
  Home,
  LogIn,
  LogOut,
  ScrollText,
  Settings,
  Trophy,
  UserRound,
  Users,
  X,
} from "lucide-react";
import type { Role } from "@/generated/prisma/client";
import { logoutAction } from "@/actions/auth";
import { ROLE_LABEL } from "@/lib/labels";
import { BrandIcon } from "@/components/BrandIcon";
import { LiveNowBanner } from "@/components/LiveNowBanner";
import { Avatar } from "@/components/Player";
import { SkeletonBlock, SkeletonText } from "@/components/Skeleton";
import { Button, cn } from "@/components/ui";
import { useCurrentUser } from "@/components/providers/UserProvider";
import { useAppShell } from "@/hooks/useAppShell";
import { useLoginRedirect } from "@/hooks/useLoginRedirect";

type NavItem = { href: string; label: string; icon: typeof Home; roles?: Role[] };

// O ultimo item da navegacao depende da sessao: "Perfil" para quem entrou,
// "Entrar" para o visitante (ver ProfileOrLoginItem).
const MAIN_NAV: NavItem[] = [
  { href: "/", label: "Início", icon: Home },
  { href: "/game-days", label: "Peladas", icon: CalendarDays },
  { href: "/ranking", label: "Ranking", icon: Trophy },
];
const PROFILE_ITEM: NavItem = { href: "/profile", label: "Perfil", icon: UserRound };

const EXTRA_NAV: NavItem[] = [
  { href: "/players", label: "Avaliar jogadores", icon: ClipboardList, roles: ["ADMIN", "SUPERADMIN"] },
  { href: "/admin/users", label: "Usuários e papéis", icon: Users, roles: ["SUPERADMIN"] },
  { href: "/admin/system", label: "Sistema", icon: Settings, roles: ["SUPERADMIN"] },
  { href: "/admin/audit", label: "Auditoria", icon: ScrollText, roles: ["SUPERADMIN"] },
];

/**
 * A casca nao espera a sessao. Navegacao, tab bar, botao de sair e a pagina
 * renderizam na hora; so os pedacos que leem o usuario suspendem, cada um no
 * seu <Suspense> com fallback do mesmo tamanho. Os links extras aparecem quando
 * o papel chega, mas o acesso a essas paginas e decidido no servidor.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { menuOpen, openMenu, closeMenu, isActive } = useAppShell();

  const desktopLink = (item: NavItem) => (
    <Link
      key={item.href}
      href={item.href}
      className={cn(
        "rounded-lg px-3 py-2 text-sm",
        isActive(item.href) ? "bg-white/10 text-slate-100" : "text-slate-400 hover:text-slate-200",
      )}
    >
      {item.label}
    </Link>
  );

  const drawerLink = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={closeMenu}
        className="touch-target flex items-center gap-3 rounded-xl px-3 text-sm text-slate-200 hover:bg-white/5"
      >
        <Icon size={20} className="text-slate-400" />
        {item.label}
      </Link>
    );
  };

  const tabLink = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <Link
        key={item.label}
        href={item.href}
        className={cn(
          "touch-target flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px]",
          isActive(item.href) ? "text-pitch-400" : "text-slate-500",
        )}
      >
        <Icon size={22} />
        {item.label}
      </Link>
    );
  };

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-night-950/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2">
            <BrandIcon className="h-8 w-8 rounded-lg" />
            <span className="text-base font-bold tracking-tight">Voa Craque</span>
          </Link>

          <nav className="ml-auto hidden items-center gap-1 sm:flex">
            {MAIN_NAV.map(desktopLink)}
            <Suspense fallback={desktopLink(PROFILE_ITEM)}>
              <ProfileOrLoginItem render={desktopLink} />
            </Suspense>
            <Suspense fallback={null}>
              <ExtraNav render={desktopLink} />
            </Suspense>
          </nav>

          <Suspense fallback={<SkeletonBlock className="ml-auto h-9 w-9 rounded-full sm:hidden" />}>
            <MobileAccount onOpenMenu={openMenu} />
          </Suspense>

          <Suspense fallback={<LogoutButton />}>
            <LogoutOrLogin />
          </Suspense>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-4 pb-28 sm:pb-10">
        {children}
        {/* Dentro do <main>: o espacador do atalho precisa ficar no fim do conteudo. */}
        <Suspense fallback={null}>
          <LiveNowBanner />
        </Suspense>
      </main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-night-950/95 backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-lg items-stretch">
          {MAIN_NAV.map(tabLink)}
          <Suspense fallback={tabLink(PROFILE_ITEM)}>
            <ProfileOrLoginItem render={tabLink} />
          </Suspense>
        </div>
      </nav>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 bg-black/70 sm:hidden" onClick={closeMenu}>
          <div
            className="snack-in absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-white/10 bg-night-900 p-4 pb-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <Suspense fallback={<DrawerIdentitySkeleton />}>
                <DrawerIdentity />
              </Suspense>
              <Button variant="ghost" size="sm" onClick={closeMenu} aria-label="Fechar">
                <X size={18} />
              </Button>
            </div>

            <div className="grid gap-1">
              {MAIN_NAV.map(drawerLink)}
              {drawerLink(PROFILE_ITEM)}
              <Suspense fallback={null}>
                <ExtraNav render={drawerLink} />
              </Suspense>
            </div>

            <form action={logoutAction} className="mt-3">
              <Button variant="secondary" size="lg" type="submit" className="w-full">
                <LogOut size={18} /> Sair
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UserAvatar({ size }: { size: "sm" | "md" }) {
  const user = useCurrentUser();
  return <Avatar name={user?.name ?? user?.username ?? ""} photoUrl={user?.photoUrl} size={size} />;
}

/** "Perfil" para quem entrou; "Entrar" (volta para esta pagina depois) para o visitante. */
function ProfileOrLoginItem({ render }: { render: (item: NavItem) => React.ReactNode }) {
  const user = useCurrentUser();
  const { loginHref } = useLoginRedirect();
  return <>{render(user ? PROFILE_ITEM : { href: loginHref, label: "Entrar", icon: LogIn })}</>;
}

/** Celular: o avatar abre a gaveta; o visitante nao tem gaveta, so o botao "Entrar". */
function MobileAccount({ onOpenMenu }: { onOpenMenu: () => void }) {
  const user = useCurrentUser();
  const { loginHref } = useLoginRedirect();

  if (!user) {
    return (
      <Link
        href={loginHref}
        className="touch-target ml-auto inline-flex items-center gap-1.5 rounded-full px-3 text-sm font-medium text-pitch-400 sm:hidden"
      >
        <LogIn size={18} /> Entrar
      </Link>
    );
  }

  return (
    <button type="button" onClick={onOpenMenu} className="ml-auto rounded-full sm:ml-0 sm:hidden" aria-label="Abrir menu">
      <UserAvatar size="sm" />
    </button>
  );
}

function LogoutButton() {
  return (
    <form action={logoutAction} className="hidden sm:block">
      <Button variant="ghost" size="sm" type="submit" aria-label="Sair">
        <LogOut size={18} />
      </Button>
    </form>
  );
}

/** Desktop: "Sair" para quem entrou, "Entrar" para o visitante. */
function LogoutOrLogin() {
  const user = useCurrentUser();
  const { loginHref } = useLoginRedirect();
  if (user) return <LogoutButton />;
  return (
    <Link href={loginHref} className="hidden sm:block">
      <Button variant="secondary" size="sm" type="button">
        <LogIn size={18} /> Entrar
      </Button>
    </Link>
  );
}

function ExtraNav({ render }: { render: (item: NavItem) => React.ReactNode }) {
  const user = useCurrentUser();
  if (!user) return null;
  return <>{EXTRA_NAV.filter((item) => !item.roles || item.roles.includes(user.role)).map(render)}</>;
}

function DrawerIdentity() {
  const user = useCurrentUser();
  return (
    <>
      <UserAvatar size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{user?.name ?? user?.username}</p>
        <p className="text-xs text-slate-500">{user ? ROLE_LABEL[user.role] : null}</p>
      </div>
    </>
  );
}

/** Mesmas medidas do avatar md (h-12) e das duas linhas de texto ao lado. */
function DrawerIdentitySkeleton() {
  return (
    <>
      <SkeletonBlock className="h-12 w-12 rounded-full" />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <SkeletonText className="h-5 w-36" />
        <SkeletonText className="h-3 w-20" />
      </div>
    </>
  );
}
