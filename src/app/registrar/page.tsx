import Link from "next/link";
import { RegisterForm } from "@/components/forms/RegisterForm";

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
