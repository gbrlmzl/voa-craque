import Link from "next/link";
import { BrandIcon } from "@/components/BrandIcon";
import { ForgotPasswordForm } from "@/components/forms/ForgotPasswordForm";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <BrandIcon className="mx-auto mb-3 h-14 w-14 rounded-2xl" />
        <h1 className="text-2xl font-bold tracking-tight">Esqueci a senha</h1>
        <p className="mt-2 text-sm text-slate-400">
          Informe o e-mail da sua conta. Se ele existir, enviamos um link para criar uma senha nova.
        </p>
      </div>

      <ForgotPasswordForm />

      <p className="mt-6 text-center text-sm text-slate-400">
        <Link href="/login" className="font-semibold text-pitch-400 underline underline-offset-4">
          Voltar para o login
        </Link>
      </p>
    </div>
  );
}
