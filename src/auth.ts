import NextAuth, { CredentialsSignin, type Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import {
  isGoogleAuthEnabled,
  SECURE_COOKIES,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  SESSION_IDLE_TTL_S,
} from "@/lib/auth/config";
import { verifyCredentials } from "@/lib/auth/credentials";
import { signInWithGoogle, userIdForGoogleAccount, type GoogleProfile } from "@/lib/auth/google";
import { nowSeconds } from "@/lib/auth/session-cookie";
import { openSession, revokeSessionFamily } from "@/lib/auth/session-store";
import { clientIp } from "@/lib/client-ip";
import { loginLimiter } from "@/lib/rate-limit";
import { credentialsSchema } from "@/lib/validation";

/** Chega na loginAction com `code` intacto (ver src/actions/auth.ts). */
class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

/**
 * Auth.js v5 cuida do que ele faz bem: o handshake OAuth (state, PKCE, nonce),
 * a verificacao de credenciais e a cifragem do cookie. A sessao em si e nossa:
 * o cookie carrega um token opaco (sid) que aponta para uma linha revogavel em
 * SessionToken, e quem rotaciona esse token e o proxy.
 */
export const { handlers, signIn, signOut } = NextAuth({
  trustHost: true,
  useSecureCookies: SECURE_COOKIES,
  session: { strategy: "jwt", maxAge: SESSION_IDLE_TTL_S },
  cookies: { sessionToken: { name: SESSION_COOKIE_NAME, options: SESSION_COOKIE_OPTIONS } },
  pages: { signIn: "/login", error: "/login" },

  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      // Tambem roda quando alguem posta direto em /api/auth/callback/credentials,
      // sem passar pela loginAction: por isso o rate limit mora aqui.
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const ip = clientIp(request.headers);
        if (loginLimiter.retryAfter(ip) > 0) throw new RateLimitedSignin();

        const user = await verifyCredentials(parsed.data.email, parsed.data.password, ip);
        if (!user) {
          loginLimiter.hit(ip);
          return null;
        }
        return user;
      },
    }),
    // Le AUTH_GOOGLE_ID e AUTH_GOOGLE_SECRET sozinho. Sem as duas, o botao some.
    // PKCE ja protege o retorno contra CSRF; `state` fica como segunda camada.
    ...(isGoogleAuthEnabled()
      ? [Google({ checks: ["pkce", "state"], authorization: { params: { prompt: "select_account" } } })]
      : []),
  ],

  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "credentials") return true;
      if (account?.provider === "google" && profile) {
        return signInWithGoogle(account.providerAccountId, profile as GoogleProfile);
      }
      return false;
    },

    /**
     * Roda com trigger "signIn" uma vez por login, e sem trigger a cada leitura
     * da sessao pelo Auth.js. So o login abre familia; nas demais leituras o
     * token passa intacto. Rotacionar aqui seria um erro: este callback tambem
     * roda onde o cookie novo nao consegue ser gravado.
     */
    async jwt({ token, user, account, trigger }) {
      if (trigger !== "signIn" && trigger !== "signUp") return token;

      const userId =
        account?.provider === "google" ? await userIdForGoogleAccount(account.providerAccountId) : user?.id;
      if (!userId) return null;

      return { sub: userId, sid: await openSession(userId), rot: nowSeconds() };
    },

    // Nada do token vai para /api/auth/session: quem esta logado se pergunta a
    // getCurrentUser(), nao ao Auth.js.
    session({ session, token }): Session {
      return { expires: session.expires, user: { id: token.sub ?? "" } };
    },
  },

  events: {
    async signOut(message) {
      if ("token" in message && typeof message.token?.sid === "string") {
        await revokeSessionFamily(message.token.sid);
      }
    },
  },

  logger: {
    // Senha errada e rate limit ja viram evento de seguranca estruturado; o log
    // padrao do Auth.js repetiria cada tentativa como stack trace de erro.
    error(error) {
      if (error instanceof CredentialsSignin) return;
      console.error("[auth]", error);
    },
  },
});
