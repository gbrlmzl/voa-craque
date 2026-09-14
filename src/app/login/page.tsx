import Link from "next/link";
import { LoginForm } from "@/components/forms/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ proximo?: string }>;
}) {
  const { proximo } = await searchParams;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-pitch-500 text-2xl font-black text-night-950">
          V
        </span>
        <h1 className="text-2xl font-bold tracking-tight">Voa Craque</h1>
        <p className="mt-1 text-sm text-slate-400">A pelada da faculdade, organizada.</p>
      </div>

      <LoginForm next={proximo} />

      <p className="mt-6 text-center text-sm text-slate-400">
        Primeira vez aqui?{" "}
        <Link href="/registrar" className="font-semibold text-pitch-400 underline underline-offset-4">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
