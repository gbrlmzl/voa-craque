import Link from "next/link";
import { isGoogleAuthEnabled } from "@/lib/auth/config";
import { BrandIcon } from "@/components/BrandIcon";
import { LoginForm } from "@/components/forms/LoginForm";
import { GoogleSignInButton, OrDivider } from "@/components/forms/GoogleSignInButton";

export const dynamic = "force-dynamic";

/**
 * O Auth.js devolve erros para cá (`pages.error`) como /login?error=Tipo.
 * A mensagem nunca diz o motivo exato: "e-mail não verificado" e "conta
 * desativada" viram o mesmo texto, e o detalhe fica no log de segurança.
 */
function authErrorMessage(error?: string, code?: string): string | undefined {
  if (!error) return undefined;
  if (error === "CredentialsSignin") {
    return code === "rate_limited"
      ? "Muitas tentativas de login. Espere alguns minutos e tente de novo."
      : "Usuário ou senha não conferem.";
  }
  if (error === "AccessDenied") return "Não foi possível entrar com essa conta do Google.";
  if (error === "Configuration") return "O login está indisponível agora. Tente de novo em instantes.";
  return "Não foi possível concluir o login com o Google. Tente de novo.";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ proximo?: string; error?: string; code?: string }>;
}) {
  const { proximo, error, code } = await searchParams;
  const googleEnabled = isGoogleAuthEnabled();

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <BrandIcon className="mx-auto mb-3 h-14 w-14 rounded-2xl" />
        <h1 className="text-2xl font-bold tracking-tight">Voa Craque</h1>
      </div>

      {googleEnabled ? (
        <>
          <GoogleSignInButton next={proximo} />
          <OrDivider label="ou entre com usuário e senha" />
        </>
      ) : null}

      <LoginForm next={proximo} notice={authErrorMessage(error, code)} googleEnabled={googleEnabled} />

      <p className="mt-6 text-center text-sm text-slate-400">
        Primeira vez aqui?{" "}
        <Link href="/register" className="font-semibold text-pitch-400 underline underline-offset-4">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
