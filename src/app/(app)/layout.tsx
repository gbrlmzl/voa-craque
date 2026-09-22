import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

/**
 * Sem guarda aqui: um `await` na sessao neste layout bloquearia toda navegacao
 * dentro de (app) e nenhum loading.tsx apareceria. Cada page.tsx chama a propria
 * guarda (pageUserWithProfile, pageAdmin...), e o proxy ja barrou quem nem tem
 * cookie de sessao.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
