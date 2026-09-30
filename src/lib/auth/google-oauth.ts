import { cookies } from "next/headers";
import { decodeIdToken, generateCodeVerifier, generateState, Google } from "arctic";
import { COOKIE_BASE_OPTIONS, OAUTH_COOKIE_NAME, OAUTH_STATE_TTL_S } from "@/lib/auth/config";
import type { GoogleProfile } from "@/lib/auth/google";
import { GOOGLE_SCOPES, googleRedirectUri, readGoogleIdClaims } from "@/lib/auth/google-oauth-state";
import { signOAuthState, verifyOAuthState } from "@/lib/auth/tokens";
import { logSecurityEvent } from "@/lib/security-log";

/**
 * Handshake com o Google (authorization code + PKCE + state), no lugar do
 * Auth.js. As regras de conta (vincular por e-mail verificado, derrubar senha
 * nao verificada, conta desativada) ficam em google.ts; a sessao e aberta por
 * quem chama, em establish-session.ts.
 *
 * Entre a ida e a volta o navegador guarda `state`, `code_verifier` e o destino
 * num cookie JWT assinado de 10 min (httpOnly, lax): nada disso vai para o banco.
 */

/** So chamado quando isGoogleAuthEnabled(). */
function googleClient(): Google {
  return new Google(process.env.AUTH_GOOGLE_ID!, process.env.AUTH_GOOGLE_SECRET!, googleRedirectUri());
}

/** Server Action: grava o cookie de state e devolve a URL de autorizacao do Google. */
export async function startGoogleSignIn(next: string): Promise<URL> {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();

  const url = googleClient().createAuthorizationURL(state, codeVerifier, GOOGLE_SCOPES);
  url.searchParams.set("prompt", "select_account");

  (await cookies()).set(OAUTH_COOKIE_NAME, await signOAuthState({ state, codeVerifier, next }), {
    ...COOKIE_BASE_OPTIONS,
    maxAge: OAUTH_STATE_TTL_S,
  });
  return url;
}

export type GoogleSignInResult =
  | { ok: true; providerAccountId: string; profile: GoogleProfile; next: string }
  | { ok: false; error: "AccessDenied" | "OAuthCallback" };

/**
 * Volta do Google: confere o state, troca o `code` pelo id_token e le a
 * identidade. Nao abre sessao nem toca no banco; devolve o que o callback precisa.
 */
export async function finishGoogleSignIn(
  params: URLSearchParams,
  stateCookie: string | undefined,
): Promise<GoogleSignInResult> {
  // A pessoa cancelou na tela do Google.
  if (params.get("error")) return { ok: false, error: "AccessDenied" };

  const code = params.get("code");
  const state = params.get("state");
  const saved = await verifyOAuthState(stateCookie);
  if (!code || !state || !saved || saved.state !== state) {
    logSecurityEvent("google_login_denied", { reason: "state_mismatch" });
    return { ok: false, error: "OAuthCallback" };
  }

  let claims: Record<string, unknown>;
  try {
    const tokens = await googleClient().validateAuthorizationCode(code, saved.codeVerifier);
    claims = decodeIdToken(tokens.idToken()) as Record<string, unknown>;
  } catch (error) {
    console.error("[auth] troca do code do Google falhou", error);
    return { ok: false, error: "OAuthCallback" };
  }

  const identity = readGoogleIdClaims(claims, process.env.AUTH_GOOGLE_ID!);
  if (!identity) {
    logSecurityEvent("google_login_denied", { reason: "invalid_id_token" });
    return { ok: false, error: "OAuthCallback" };
  }

  return { ok: true, ...identity, next: saved.next };
}
