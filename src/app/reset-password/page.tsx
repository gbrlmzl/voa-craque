import type { Metadata } from "next";
import Link from "next/link";
import { findUsableResetToken } from "@/lib/auth/password-reset";
import { BrandIcon } from "@/components/BrandIcon";
import { Card } from "@/components/ui";
import { ResetPasswordForm } from "@/components/forms/ResetPasswordForm";

export const dynamic = "force-dynamic";

// O token vai na URL; "no-referrer" evita que ele vaze no header Referer de um
// link clicado dentro da pagina (ou de recursos externos que ela venha a carregar).
export const metadata: Metadata = {
  title: "Redefinir senha",
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  // So leitura (findUsableResetToken nao consome o token): antivirus e previews
  // de e-mail abrem este link com GET, e consumir aqui queimaria o link antes
  // da pessoa clicar de verdade.
  const usable = token ? await findUsableResetToken(token) : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <BrandIcon className="mx-auto mb-3 h-14 w-14 rounded-2xl" />
        <h1 className="text-2xl font-bold tracking-tight">Redefinir senha</h1>
      </div>

      {usable && token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Card className="grid gap-3">
          <p className="text-sm text-slate-300">Este link é inválido ou expirou.</p>
          <Link href="/forgot-password" className="text-sm font-semibold text-pitch-400 underline underline-offset-4">
            Pedir um novo link
          </Link>
        </Card>
      )}
    </div>
  );
}
