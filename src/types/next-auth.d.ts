import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

// Claims proprios do cookie de sessao (ver src/lib/auth/session-cookie.ts).
declare module "next-auth/jwt" {
  interface JWT {
    sid?: string;
    rot?: number;
    pend?: true;
  }
}

export {};
