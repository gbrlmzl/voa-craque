import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { COOKIE_BASE_OPTIONS, isGoogleAuthEnabled, OAUTH_COOKIE_NAME } from "@/lib/auth/config";
import { establishSession } from "@/lib/auth/establish-session";
import { signInWithGoogle, userIdForGoogleAccount } from "@/lib/auth/google";
import { finishGoogleSignIn } from "@/lib/auth/google-oauth";
import { safeNextPath } from "@/lib/auth/routes";

export const dynamic = "force-dynamic";

/**
 * Volta do Google. Uso unico do cookie de state; sucesso abre a sessao e leva ao
 * destino. Fica sob /api/auth/*, que o proxy nao toca: o cookie de state precisa
 * chegar aqui intacto e a sessao e gravada aqui mesmo.
 *
 * `redirect()` num route handler responde 307 e leva junto os cookies gravados
 * com `cookies().set`. Erros voltam para /login?error=Tipo.
 */
export async function GET(req: NextRequest) {
  const jar = await cookies();
  const stateCookie = jar.get(OAUTH_COOKIE_NAME)?.value;
  // Uso unico: qualquer que seja o resultado, o state nao serve uma segunda vez.
  jar.set(OAUTH_COOKIE_NAME, "", { ...COOKIE_BASE_OPTIONS, maxAge: 0 });

  if (!isGoogleAuthEnabled()) redirect("/login?error=Configuration");

  const result = await finishGoogleSignIn(req.nextUrl.searchParams, stateCookie);
  if (!result.ok) redirect(`/login?error=${result.error}`);

  // Regras de vinculo/criacao de conta e de conta desativada (src/lib/auth/google.ts).
  if (!(await signInWithGoogle(result.providerAccountId, result.profile))) redirect("/login?error=AccessDenied");

  const userId = await userIdForGoogleAccount(result.providerAccountId);
  if (!userId) redirect("/login?error=AccessDenied");

  await establishSession(userId);
  redirect(safeNextPath(result.next));
}
