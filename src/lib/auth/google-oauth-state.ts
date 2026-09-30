import type { GoogleProfile } from "@/lib/auth/google"; // import type: nao carrega Prisma

/**
 * Partes puras do login com o Google (sem arctic, Prisma nem next/headers), para
 * os testes rodarem sem rede nem banco. O handshake em si esta em google-oauth.ts.
 */

export const GOOGLE_SCOPES = ["openid", "email", "profile"];
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

/**
 * Caminho fixo, o mesmo que o Auth.js usava: nada muda no Google Cloud Console.
 * Sempre a partir de AUTH_URL, nunca do header Host (que o cliente controla).
 */
export function googleRedirectUri(): string {
  const base = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (!base) throw new Error("AUTH_URL precisa estar definido para o login com o Google.");
  return new URL("/api/auth/callback/google", base).toString();
}

/**
 * Le os claims do id_token e confere emissor e destinatario. O token chega
 * direto do endpoint de token do Google, por TLS, em troca do `code` + client
 * secret, entao a assinatura pode ser dispensada (OIDC Core 3.1.3.7); `iss` e
 * `aud` sao conferidos mesmo assim.
 */
export function readGoogleIdClaims(
  claims: Record<string, unknown>,
  clientId: string,
): { providerAccountId: string; profile: GoogleProfile } | null {
  if (typeof claims.iss !== "string" || !GOOGLE_ISSUERS.has(claims.iss)) return null;
  if (claims.aud !== clientId) return null;
  if (typeof claims.sub !== "string" || claims.sub === "") return null;

  const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
  return {
    providerAccountId: claims.sub,
    profile: {
      email: text(claims.email),
      email_verified: typeof claims.email_verified === "boolean" ? claims.email_verified : null,
      name: text(claims.name),
      picture: text(claims.picture),
    },
  };
}
