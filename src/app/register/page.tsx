import Link from "next/link";
import { isGoogleAuthEnabled } from "@/lib/auth/config";
import { onboardingHref, withNext } from "@/lib/auth/routes";
import { RegisterForm } from "@/components/forms/RegisterForm";
import { GoogleSignInButton, OrDivider } from "@/components/forms/GoogleSignInButton";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ proximo?: string }>;
}) {
  // Quem veio de uma pagina (ex.: "Quero jogar") volta para ela depois do perfil.
  const { proximo } = await searchParams;
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Criar conta</h1>
      </div>

      {isGoogleAuthEnabled() ? (
        <>
          {/* O mesmo fluxo do login: conta nova pelo Google nasce no primeiro acesso. */}
          <GoogleSignInButton next={onboardingHref(proximo)} />
          <OrDivider label="ou cadastre com e-mail" />
        </>
      ) : null}

      <RegisterForm next={proximo} />

      <p className="mt-6 text-center text-sm text-slate-400">
        Já tem conta?{" "}
        <Link href={withNext("/login", proximo)} className="font-semibold text-pitch-400 underline underline-offset-4">
          Entrar
        </Link>
      </p>
    </div>
  );
}
