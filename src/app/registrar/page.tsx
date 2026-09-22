import Link from "next/link";
import { isGoogleAuthEnabled } from "@/lib/auth/config";
import { RegisterForm } from "@/components/forms/RegisterForm";
import { GoogleSignInButton, OrDivider } from "@/components/forms/GoogleSignInButton";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Criar conta</h1>
        <p className="mt-1 text-sm text-slate-400">
          Depois você preenche o perfil de jogador e já pode se inscrever na próxima pelada.
        </p>
      </div>

      {isGoogleAuthEnabled() ? (
        <>
          {/* O mesmo fluxo do login: conta nova pelo Google nasce no primeiro acesso. */}
          <GoogleSignInButton next="/primeiro-acesso" />
          <OrDivider label="ou cadastre com e-mail" />
        </>
      ) : null}

      <RegisterForm />

      <p className="mt-6 text-center text-sm text-slate-400">
        Já tem conta?{" "}
        <Link href="/login" className="font-semibold text-pitch-400 underline underline-offset-4">
          Entrar
        </Link>
      </p>
    </div>
  );
}
