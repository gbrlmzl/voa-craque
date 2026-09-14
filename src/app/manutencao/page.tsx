import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const settings = await prisma.systemSetting.findUnique({ where: { id: "global" } });
  const user = await getCurrentUser();

  if (settings?.publicAccessEnabled !== false || user?.role === "SUPERADMIN") {
    redirect("/");
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-amber-500/15 text-3xl">🛠️</span>
      <h1 className="text-xl font-bold">Voa Craque em manutenção</h1>
      <p className="mt-2 text-sm text-slate-400">
        {settings?.maintenanceMessage ?? "Volte em alguns minutos."}
      </p>

      {user ? (
        // Quem esta logado nao consegue abrir /login; sair e o caminho para
        // entrar com a conta do superadmin.
        <form action={logoutAction} className="mt-8">
          <Button variant="secondary" size="lg" type="submit">
            Sair da conta
          </Button>
        </form>
      ) : (
        <Link href="/login" className="mt-8 text-sm text-slate-500 underline underline-offset-4">
          Voltar ao login
        </Link>
      )}
    </div>
  );
}
